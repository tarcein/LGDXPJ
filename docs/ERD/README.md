# ERD 안내

이 폴더는 요구사항 분석용 논리 ERD와 실제 구현 물리 ERD를 분리해 관리한다.

- 요구사항 논리 ERD 원본: [`00_요구사항_논리_ERD.mmd`](./00_요구사항_논리_ERD.mmd)
- 요구사항 논리 ERD DBML: [`00_요구사항_논리_ERD.dbml`](./00_요구사항_논리_ERD.dbml)
- 기준 파일: [`backend/app/db.py`](../../backend/app/db.py)의 `SCHEMA`와 `initialize()` 마이그레이션
- 구현 물리 ERD 원본: [`01_구현스키마_ERD.mmd`](./01_구현스키마_ERD.mmd)
- 구현 물리 ERD DBML: [`01_구현스키마_ERD.dbml`](./01_구현스키마_ERD.dbml)
- MVP 핵심 기능 ERD 원본: [`02_MVP_핵심기능_ERD.mmd`](./02_MVP_핵심기능_ERD.mmd)
- MVP 핵심 기능 DBML: [`02_MVP_핵심기능_ERD.dbml`](./02_MVP_핵심기능_ERD.dbml)
- 요구사항 논리 ERD: 27개 객체
- 구현 물리 ERD: 29개 테이블
- MVP 핵심 기능 ERD: 12개 객체
- 저장소: 로컬 테스트 SQLite / `DATABASE_URL` 설정 시 PostgreSQL 호환 경로

## 읽는 법

## dbdiagram.io에 넣는 방법

1. 제출용이면 [`00_요구사항_논리_ERD.dbml`](./00_요구사항_논리_ERD.dbml), 구현 확인용이면 [`01_구현스키마_ERD.dbml`](./01_구현스키마_ERD.dbml)을 연다.
2. 파일 전체를 복사한다.
3. [dbdiagram.io](https://dbdiagram.io/)에서 새 다이어그램을 만든다.
4. 왼쪽 편집기에 기존 내용을 지우고 DBML을 붙여넣는다.

현재 열어둔 `.mmd` 파일은 Mermaid 문법이라 dbdiagram.io에 붙여넣으면 안 된다. dbdiagram.io에는 `.dbml` 파일 내용을 넣어야 한다.

- `PK`, `FK`, `UK`는 기본키·외래키·유니크 키다.
- `family_group`이 테넌트 경계이며 대부분의 기능 테이블이 `family_id`로 연결된다.
- `notification.action_type/action_id`는 다형성 참조라 실제 FK를 만들지 않는다.
- `family_subscription`과 `payment_transaction`은 구현상 `family_id`를 통해 연결된다. 결제 거래가 구독 행을 직접 참조하지 않는 현재 코드 구조를 그대로 표시했다.
- `media_asset.storage_path`, `date_folder`, `care_handoff.special_note`, `child.photo_storage_path/photo_mime_type/photo_updated_at`(아이 프로필 사진), `notification_preference.device_enabled`(TV 가전 알림 토글), `personal_schedule.has_end_time`/`child_schedule.has_end_time`(시간 없는 종일 일정 여부)처럼 `initialize()`에서 후속 추가된 핵심 컬럼도 포함했다. (가독성을 위해 모든 운영 컬럼을 전부 나열하지는 않았다.)
- `push_device_token`(Android 푸시 토큰 등록) 테이블을 포함했다. 이전 버전 ERD에는 누락돼 있었다.

## 설계 문서와의 차이

요구사항 논리 ERD는 현재 업무 객체정의서와 동일한 27개 객체를 사용한다. 레거시 호환용 `family_invite_code`와 개발·데모용 `plan_preview`는 제외한다.

구현 물리 ERD는 현재 데이터베이스에 실제로 존재하는 두 테이블까지 포함해 29개다. 요구사항 문서와 구현 물리 ERD의 개체 수가 다른 이유는 이 범위 차이 때문이다.

`docs/LG_가족_운영_에이전트_데이터객체정의서_완성.md`의 DBML은 PostgreSQL 목표 모델(34개 객체)이므로 현재 요구사항·구현 ERD와 범위가 다르다. 구현 DB를 목표 모델로 마이그레이션할 때는 관련 문서를 함께 갱신해야 한다.
