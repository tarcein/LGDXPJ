"""Region-aware Subsidy24 care benefits for each family room."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from urllib.parse import unquote
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .config import setting
from .db import database
from .family import authenticated, family_id, require_owner


router = APIRouter(prefix="/api/benefits", tags=["care benefits"])
LIST_URL = "https://api.odcloud.kr/api/gov24/v3/serviceList"
INSTITUTION_URL = "https://apis.data.go.kr/1383000/idis/serviceInstitutionService/getServiceInstitutionList"
INCOME_CRITERIA_URL = "https://apis.data.go.kr/1383000/idis/familyIncomeCriteriaService/getFamilyIncomeCriteriaList"
INSURANCE_CRITERIA_URL = "https://apis.data.go.kr/1383000/idis/healthInsuranceService/getHealthInsuranceCriteriaList"
AREA_PATTERN = re.compile(r"^[가-힣0-9·\-\s]+$")
CENTRAL_ORGANIZATION = "중앙행정기관"
CHILD_SUBJECT_TERMS = (
    "아이", "아동", "영아", "유아", "어린이", "자녀", "신생아", "초등", "학생", "청소년", "손주",
)
CARE_PURPOSE_TERMS = ("돌봄", "보육", "육아")
ADULT_ONLY_TITLE_TERMS = ("노인", "어르신", "성인", "장애인", "반려동물")
PROVINCE_API_NAMES = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
    "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
    "경기도": "경기", "강원도": "강원", "강원특별자치도": "강원", "충청북도": "충북",
    "충청남도": "충남", "전라북도": "전북", "전북특별자치도": "전북", "전라남도": "전남",
    "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주",
}


class BenefitLocationUpdate(BaseModel):
    city: str = Field(min_length=2, max_length=40)
    district: str = Field(min_length=1, max_length=40)


def _clean(value: Any, maximum: int = 4000) -> str:
    return str(value or "").strip()[:maximum]


def _is_child_care(row: dict[str, Any]) -> bool:
    title = _clean(row.get("서비스명")).casefold()
    summary = _clean(row.get("서비스목적요약")).casefold()
    headline = f"{title} {summary}"
    if any(term in title for term in ADULT_ONLY_TITLE_TERMS) and not any(term in title for term in CHILD_SUBJECT_TERMS):
        return False
    return (
        any(term in headline for term in CHILD_SUBJECT_TERMS)
        and any(term in headline for term in CARE_PURPOSE_TERMS)
    )


def _require_pro() -> None:
    with database() as db:
        row = db.execute("SELECT plan FROM family_group WHERE id = ?", (family_id(),)).fetchone()
    if row is None:
        raise HTTPException(404, "가족방을 찾을 수 없습니다")
    if row["plan"] != "PRO":
        raise HTTPException(403, detail={
            "code": "SUBSCRIPTION_REQUIRED",
            "message": "돌봄 제도 안내는 Pro 구독이 필요합니다",
        })


def _validate_area(value: str, label: str) -> str:
    normalized = " ".join(value.strip().split())
    if not normalized or not AREA_PATTERN.fullmatch(normalized):
        raise HTTPException(422, f"{label}에는 시·도 또는 시·군·구 이름만 입력해주세요")
    return normalized


def _stored_location() -> dict[str, str]:
    with database() as db:
        row = db.execute(
            "SELECT city, district, updated_at FROM family_location WHERE family_id = ?",
            (family_id(),),
        ).fetchone()
    return dict(row) if row else {"city": "", "district": "", "updated_at": ""}


def _normalize(row: dict[str, Any], *, scope: str, region: str) -> dict[str, str]:
    detail_url = _clean(row.get("상세조회URL"), 1000)
    if not detail_url.startswith(("https://", "http://")):
        detail_url = ""
    return {
        "id": _clean(row.get("서비스ID"), 80),
        "name": _clean(row.get("서비스명"), 240),
        "summary": _clean(row.get("서비스목적요약"), 1200),
        "category": _clean(row.get("서비스분야"), 120),
        "organization": _clean(row.get("소관기관명"), 240),
        "organization_type": _clean(row.get("소관기관유형"), 120),
        "target": _clean(row.get("지원대상")),
        "content": _clean(row.get("지원내용")),
        "criteria": _clean(row.get("선정기준")),
        "deadline": _clean(row.get("신청기한"), 500),
        "method": _clean(row.get("신청방법"), 1200),
        "contact": _clean(row.get("전화문의"), 500),
        "url": detail_url,
        "updated_at": _clean(row.get("수정일시"), 30),
        "scope": scope,
        "region": region,
    }


def _request_list(params: dict[str, Any]) -> list[dict[str, Any]]:
    service_key = setting("SUBSIDY24_SERVICE_KEY")
    if not service_key:
        raise HTTPException(503, detail={
            "code": "SUBSIDY24_NOT_CONFIGURED",
            "message": "보조금24 API 키를 backend/.env에 설정해주세요",
        })
    try:
        response = httpx.get(
            LIST_URL,
            params={"serviceKey": service_key, "page": 1, **params},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, detail={
            "code": "SUBSIDY24_UNAVAILABLE",
            "message": "보조금24에서 돌봄 제도를 가져오지 못했습니다",
        }) from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise HTTPException(502, detail={
            "code": "SUBSIDY24_INVALID_RESPONSE",
            "message": "보조금24 응답 형식을 확인할 수 없습니다",
        })
    return [row for row in payload["data"] if isinstance(row, dict)]


def _public_data_rows(*, key_name: str, url: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    service_key = setting(key_name)
    if not service_key:
        raise HTTPException(503, detail={
            "code": "CARE_DATA_NOT_CONFIGURED",
            "message": f"{key_name} 값을 backend/.env에 설정해주세요",
        })
    try:
        response = httpx.get(
            url,
            params={
                "ServiceKey": unquote(service_key),
                "pageNo": 1,
                "numOfRows": 500,
                "type": "json",
                **(params or {}),
            },
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, detail={
            "code": "CARE_DATA_UNAVAILABLE",
            "message": "아이돌봄 공공데이터를 가져오지 못했습니다",
        }) from exc

    response_data = payload.get("response") if isinstance(payload, dict) else None
    header = response_data.get("header") if isinstance(response_data, dict) else None
    body = response_data.get("body") if isinstance(response_data, dict) else None
    if not isinstance(header, dict) or str(header.get("resultCode")) not in {"0", "00", "0000"}:
        message = _clean(header.get("resultMsg") if isinstance(header, dict) else "")
        raise HTTPException(502, detail={
            "code": "CARE_DATA_API_ERROR",
            "message": message or "아이돌봄 공공데이터 API가 오류를 반환했습니다",
        })
    if not isinstance(body, dict):
        raise HTTPException(502, detail={
            "code": "CARE_DATA_INVALID_RESPONSE",
            "message": "아이돌봄 공공데이터 응답 형식을 확인할 수 없습니다",
        })
    items = body.get("items")
    rows = items.get("item", []) if isinstance(items, dict) else []
    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list):
        raise HTTPException(502, detail={
            "code": "CARE_DATA_INVALID_RESPONSE",
            "message": "아이돌봄 공공데이터 목록 형식을 확인할 수 없습니다",
        })
    return [row for row in rows if isinstance(row, dict)]


def _number(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _area_from_query(city: str | None, district: str | None) -> tuple[str, str]:
    if city is None and district is None:
        stored = _stored_location()
        city, district = stored["city"], stored["district"]
    elif city is None or district is None:
        raise HTTPException(422, "시·도와 시·군·구를 함께 입력해주세요")
    if not city or not district:
        raise HTTPException(422, detail={
            "code": "BENEFIT_LOCATION_REQUIRED",
            "message": "돌봄 정보를 찾을 시·도와 시·군·구를 먼저 입력해주세요",
        })
    return _validate_area(city, "시·도"), _validate_area(district, "시·군·구")


@router.get("/location")
def benefit_location():
    return _stored_location()


@router.patch("/location")
def update_benefit_location(payload: BenefitLocationUpdate):
    _require_pro()
    city = _validate_area(payload.city, "시·도")
    district = _validate_area(payload.district, "시·군·구")
    updated_at = datetime.now(ZoneInfo("Asia/Seoul")).isoformat()
    with database() as db:
        if authenticated():
            require_owner(db)
        db.execute(
            """INSERT INTO family_location(family_id, city, district, updated_at) VALUES (?, ?, ?, ?)
               ON CONFLICT(family_id) DO UPDATE SET city=excluded.city,
               district=excluded.district, updated_at=excluded.updated_at""",
            (family_id(), city, district, updated_at),
        )
    return {"city": city, "district": district, "updated_at": updated_at}


@router.get("")
def benefits(
    keyword: str = Query(default="돌봄", min_length=1, max_length=40),
    city: str | None = Query(default=None, max_length=40),
    district: str | None = Query(default=None, max_length=40),
    per_page: int = Query(default=30, ge=1, le=50),
):
    _require_pro()
    city, district = _area_from_query(city, district)
    district_region = f"{city} {district}"
    keyword_text = keyword.strip().casefold()

    regional_rows: list[tuple[dict[str, Any], str]] = []
    for organization, scope in ((district_region, "DISTRICT"), (city, "CITY")):
        rows = _request_list({"perPage": 100, "cond[소관기관명::EQ]": organization})
        regional_rows.extend((row, scope) for row in rows)
    national_rows = _request_list({
        "perPage": 100,
        "cond[서비스명::LIKE]": keyword.strip(),
    })

    programs: list[dict[str, str]] = []
    seen: set[str] = set()
    for row, scope in regional_rows:
        searchable = " ".join(str(value or "") for value in row.values()).casefold()
        if keyword_text not in searchable or not _is_child_care(row):
            continue
        program = _normalize(row, scope=scope, region=district_region if scope == "DISTRICT" else city)
        if program["id"] and program["id"] not in seen:
            seen.add(program["id"])
            programs.append(program)
    local_count = len(programs)
    for row in national_rows:
        if _clean(row.get("소관기관유형")) != CENTRAL_ORGANIZATION or not _is_child_care(row):
            continue
        program = _normalize(row, scope="NATIONAL", region="전국")
        if program["id"] and program["id"] not in seen:
            seen.add(program["id"])
            programs.append(program)
    national_count = len(programs) - local_count
    return {
        "programs": programs[:per_page],
        "keyword": keyword.strip(),
        "location": {"city": city, "district": district, "label": district_region},
        "local_count": local_count,
        "national_count": national_count,
        "audience": "CHILD_CARE_ONLY",
        "source": "보조금24",
    }


@router.get("/institutions")
def care_institutions(
    city: str | None = Query(default=None, max_length=40),
    district: str | None = Query(default=None, max_length=40),
):
    _require_pro()
    city, district = _area_from_query(city, district)
    provider_city = PROVINCE_API_NAMES.get(city, city)
    rows = _public_data_rows(
        key_name="IDOL_CARE_INSTITUTION_SERVICE_KEY",
        url=INSTITUTION_URL,
        params={"ctpvNm": provider_city, "sggNm": district},
    )
    institutions = [{
        "id": _clean(row.get("childCareInstNo"), 80),
        "name": _clean(row.get("childCareInstNm"), 240),
        "city": _clean(row.get("ctpvNm"), 40),
        "district": _clean(row.get("sggNm"), 40),
        "service_area": _clean(row.get("srvcPvsnAreaNm"), 500),
        "phone": _clean(row.get("rprsTelno"), 40),
        "direct_phone": _clean(row.get("drtlnTelno"), 40),
        "address": _clean(row.get("addr"), 500),
        "longitude": row.get("lot"),
        "latitude": row.get("lat"),
        "data_date": _clean(row.get("dataCrtrYmd"), 20),
    } for row in rows]
    return {
        "institutions": institutions,
        "location": {"city": city, "district": district, "label": f"{city} {district}"},
        "source": "아이돌봄 서비스 제공기관 현황",
    }


@router.get("/eligibility-criteria")
def eligibility_criteria():
    _require_pro()
    income_rows = _public_data_rows(
        key_name="IDOL_CARE_HOUSEHOLD_INCOME_SERVICE_KEY",
        url=INCOME_CRITERIA_URL,
    )
    insurance_rows = _public_data_rows(
        key_name="IDOL_CARE_HEALTH_INSURANCE_SERVICE_KEY",
        url=INSURANCE_CRITERIA_URL,
    )
    latest_year = max(
        [_clean(row.get("crtrYr"), 4) for row in income_rows + insurance_rows if _clean(row.get("crtrYr"), 4)],
        default="",
    )
    if latest_year:
        income_rows = [row for row in income_rows if _clean(row.get("crtrYr"), 4) == latest_year]
        insurance_rows = [row for row in insurance_rows if _clean(row.get("crtrYr"), 4) == latest_year]
    income = sorted([{
        "year": _clean(row.get("crtrYr"), 4),
        "grade": _clean(row.get("jgmtGrdeNm"), 40),
        "median_percent": _number(row.get("mdincmCrtrAmt")),
        "household_size": _number(row.get("mohshdCnt")),
        "monthly_income": _number(row.get("mmAvgErngCrtrAmt")),
        "data_date": _clean(row.get("dataCrtrYmd"), 20),
    } for row in income_rows], key=lambda row: (row["household_size"], row["median_percent"]))
    insurance = sorted([{
        "year": _clean(row.get("crtrYr"), 4),
        "income": _number(row.get("erngAmt")),
        "employee_premium": _number(row.get("wrcHlthIsrprmOselfBrdnAmt")),
        "regional_premium": _number(row.get("areaHlthIsrprmOselfBrdnAmt")),
        "mixed_premium": _number(row.get("mixHlthIsrprmAmt")),
        "data_date": _clean(row.get("dataCrtrYmd"), 20),
    } for row in insurance_rows], key=lambda row: row["income"])
    data_dates = [row["data_date"] for row in income + insurance if row["data_date"]]
    return {
        "year": latest_year,
        "data_date": max(data_dates, default=""),
        "household_income": income,
        "health_insurance": insurance,
        "disclaimer": "공공데이터의 참고 기준이며 실제 지원 여부와 지원액은 공식 신청 심사를 통해 결정됩니다.",
        "source": "아이돌봄 가구소득 및 건강보험료 기준",
    }
