# 구현 스키마 ERD

이 폴더의 ERD는 기획 문서의 미래형 34개 객체가 아니라, 현재 코드에서 실제로 생성·조회하는 스키마를 기준으로 한다.

- 기준 파일: [`backend/app/db.py`](../../backend/app/db.py)의 `SCHEMA`와 `initialize()` 마이그레이션
- 원본 Mermaid: [`01_구현스키마_ERD.mmd`](./01_구현스키마_ERD.mmd)
- dbdiagram.io용 DBML: [`01_구현스키마_ERD.dbml`](./01_구현스키마_ERD.dbml)
- MVP 핵심 기능만 추린 DBML: [`02_MVP_핵심기능_ERD.dbml`](./02_MVP_핵심기능_ERD.dbml)
- 현재 엔터티 수: 28개
- 저장소: 로컬 테스트 SQLite / `DATABASE_URL` 설정 시 PostgreSQL 호환 경로

## 읽는 법

## dbdiagram.io에 넣는 방법

1. [`01_구현스키마_ERD.dbml`](./01_구현스키마_ERD.dbml)을 연다.
2. 파일 전체를 복사한다.
3. [dbdiagram.io](https://dbdiagram.io/)에서 새 다이어그램을 만든다.
4. 왼쪽 편집기에 기존 내용을 지우고 DBML을 붙여넣는다.

현재 열어둔 `.mmd` 파일은 Mermaid 문법이라 dbdiagram.io에 붙여넣으면 안 된다. dbdiagram.io에는 `.dbml` 파일 내용을 넣어야 한다.

- `PK`, `FK`, `UK`는 기본키·외래키·유니크 키다.
- `family_group`이 테넌트 경계이며 대부분의 기능 테이블이 `family_id`로 연결된다.
- `notification.action_type/action_id`는 다형성 참조라 실제 FK를 만들지 않는다.
- `family_subscription`과 `payment_transaction`은 구현상 `family_id`를 통해 연결된다. 결제 거래가 구독 행을 직접 참조하지 않는 현재 코드 구조를 그대로 표시했다.
- `media_asset.storage_path`, `date_folder`, `care_handoff.special_note`처럼 `initialize()`에서 후속 추가된 핵심 컬럼도 포함했다. (가독성을 위해 모든 운영 컬럼을 전부 나열하지는 않았다.)

## 설계 문서와의 차이

`docs/LG_가족_운영_에이전트_데이터객체정의서_완성.md`의 DBML은 PostgreSQL 목표 모델(34개 객체)이다. 반면 이 ERD는 현재 구현 모델(27개 테이블)이다. 따라서 `account`, `subscription_plan`, `care_alternative`, `care_completion`, `care_note`, `family_album` 등 목표 모델 전용 테이블은 이 구현 ERD에 넣지 않았다. 구현 DB를 목표 모델로 마이그레이션할 때는 두 문서를 함께 갱신해야 한다.
