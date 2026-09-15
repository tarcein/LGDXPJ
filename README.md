# LG Family Care 개발 목업

Figma [`기능` 페이지](https://www.figma.com/design/l6KPNTjOaPSNsmCkvZR5lW/DX-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8?node-id=413-8)의 모바일 목업과 이 폴더의 [`docs`](docs/) 요구사항을 기준으로 만든 팀 개발용 프로토타입입니다.

## 폴더와 담당 경계

| 폴더 | 역할 | 주 작업 |
|---|---|---|
| `frontend/` | React·TypeScript UI | Figma 화면, 사용자 흐름, 접근성, API 호출 |
| `backend/` | FastAPI·SQLite API | 데이터 저장, 돌봄 상태 전이, 정책, 외부 연동 어댑터 |
| `docs/` | 기획·계약 | 원본 기획 자료, [개발 범위와 API 계약](docs/개발_계약.md) |

프론트엔드와 백엔드는 `/api` 경로와 [`docs/개발_계약.md`](docs/개발_계약.md)의 상태·요청 형식으로 연결됩니다. `frontend/vite.config.ts`가 개발 중 API 요청을 `127.0.0.1:8000`으로 전달합니다. 프론트엔드는 백엔드 저장소 테이블에 직접 의존하지 않습니다.

## 로컬 실행 (PowerShell)

두 터미널을 열고 저장소 루트에서 각각 실행합니다.

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

```powershell
cd frontend
npm install
npm run dev
```

화면은 `http://127.0.0.1:5173`, API 문서는 `http://127.0.0.1:8000/docs`입니다. 첫 실행 때 가상의 가족·아이·돌봄 일정 데이터가 SQLite DB에 들어갑니다. DB 파일은 Git에 올리지 않습니다.

## 현재 동작 범위

Family Inbox 텍스트 등록 → 항목 확인·수정 → Role Match 담당 제안 → 요청·수락 → 인수인계 확인 → 완료·특이사항 → 알림 흐름이 실제 API와 DB로 연결되어 있습니다. 개인 일정 충돌 탐지, 무료 플랜 인원 제한, 구성원별 공개 범위 설정도 포함됩니다. Figma의 확장 화면은 내비게이션과 주요 화면 구성까지 구현했습니다.

OCR, 외부 캘린더 OAuth, ThinQ 푸시·가전, 위치 수집, 음성 입력, 생성형 AI, 결제·구독은 제공자 계정과 연동 명세가 필요합니다. 현재 사진 선택은 사용자가 사진 내용을 보고 텍스트로 확인하는 흐름이며, 사진 파일이나 위치를 서버에 전송하지 않습니다. 확장 화면의 위치·앨범·지원 제도 데이터는 목업 예시입니다.

이 코드는 **로컬 개발용 데모**입니다. 인증·가족별 접근 통제와 아동 개인정보 저장 보호는 아직 구현되지 않았으므로 실제 가족 데이터를 입력하거나 공개 서버로 배포하면 안 됩니다. 운영 단계에서 `docs/비기능요구사항명세서.md`의 보안·개인정보 요구사항을 반드시 구현해야 합니다.

## 검증

```powershell
cd backend
python -m unittest discover -s tests -v
```

```powershell
cd frontend
npm run build
npm run lint
```

Edge가 설치된 Windows에서 앱을 띄운 뒤 `node scripts/visual-check.mjs`로 홈·Family Inbox·추출 결과·등록 화면 렌더링을 확인할 수 있습니다. 자동 CI 설정안은 `docs/ci_template.yml`에 있으며, GitHub 인증에 `workflow` 권한이 준비되면 `.github/workflows/ci.yml`로 옮겨 활성화합니다.
