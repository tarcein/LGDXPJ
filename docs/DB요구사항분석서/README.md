# 데이터베이스 요구사항 분석서

DB 설계를 "요구사항 정의 → 객체 정의 → E-R 관계 분석"의 3단계로 나눠 진행한 결과물이다. **목표(미래) 모델이 아니라, 지금 실제로 구현되어 있는 스키마**(`backend/app/db.py`의 `SCHEMA`)를 기준으로 작성했다.

## 진행 순서와 방법

1. **[01_요구사항정의서.md](01_요구사항정의서.md)** — 각 테이블을 "이 기능을 쓰려면 이 데이터가 필요하다"는 문장으로 풀어써서, 어떤 개체·속성·관계가 필요한지 근거를 남긴다.
2. **[02_객체정의서.md](02_객체정의서.md)** — 위 문장에서 저장할 가치가 있는 명사를 뽑아 개체(테이블)와 속성(컬럼)으로 분류하고, PK/FK/UK를 표시한다.
3. **[03_관계분석서.md](03_관계분석서.md)** — 문장 속 동사에서 관계를 추출해 매핑 카디널리티(1:1·1:N·N:N)와 참여 특성(필수·선택)을 결정한다. 관계 자체가 속성을 갖는 다대다 관계(담당 배정, 인수인계, 예외 상황)는 실제 예시처럼 상세히 풀어서 다뤘다.

## 기준 파일

- 스키마 원본: [`backend/app/db.py`](../../backend/app/db.py)
- 시각화된 ERD(다이어그램·DBML): [`../ERD/`](../ERD/)
- 이 문서와 `../ERD/`는 같은 스키마를 다루지만 목적이 다르다 — `../ERD/`는 "결과물"(다이어그램), 이 폴더는 "그 결과물이 왜 이런 모양인지"를 문장 단위로 추적하는 분석 과정이다.

## 테이블 수

**29개.** 그룹별 집계와 목록은 `02_객체정의서.md`의 "개체 수 집계" 표를 참고.

| 그룹 | 테이블 |
|---|---|
| 가족·구성원·자녀 (4) | family_group, family_location, family_member, child |
| 인증·초대 (3) | family_invite_code, family_invite_link, family_session |
| 일정 (2) | personal_schedule, child_schedule |
| 돌봄 처리 파이프라인 (5) | care_intake, care_item, care_assignment, care_exception, care_handoff |
| 알림·설정 (3) | notification, family_data_permission, notification_preference |
| 사용량·AI (3) | daily_usage, assistant_message, plan_preview |
| 긴급·미디어·디바이스 (4) | emergency_request, media_asset, device_alert_outbox, push_device_token |
| 혜택·구독·결제 (3) | member_benefit_location, family_subscription, payment_transaction |
| 캘린더 연동 (2) | calendar_oauth_state, calendar_connection |
