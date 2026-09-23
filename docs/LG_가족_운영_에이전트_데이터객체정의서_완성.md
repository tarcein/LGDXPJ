# ZIPPY 데이터 객체 정의서

## 1. 작성 기준

이 문서는 다음 산출물을 교차 분석해 작성한 논리·물리 데이터 모델 초안이다.

- `PRD_MVP_AI가족운영에이전트.md`: MVP 핵심 기능, Freemium 정책, Phase 2 부가 기능
- `기능요구사항명세서.md`: FR-001\~FR-035의 저장·조회·권한·상태 요구
- `비기능요구사항명세서.md`: 암호화, 권한, 보관기간, 감사, 외부 연동, 사용량 카운팅 요구
- `유스케이스명세서.md`: UC-01\~UC-10의 입력·상태 변화·예외 흐름
- `서비스흐름도/`: Family Inbox, Role Match, Exception Care, Care Handoff, 완료, 알림의 처리 경계

물리명은 PostgreSQL 기준의 영문 snake\_case를 사용했다. `NULL 여부`의 Y는 값이 없을 수 있음을 뜻하고, `식별자 여부`의 Y는 해당 속성이 PK 또는 외부 시스템 식별자임을 뜻한다. 개인정보·위치·사진은 업무 데이터와 분리 보관하거나 암호화 컬럼/암호화 저장소를 적용하는 것을 전제로 한다.

> **(2026-09 갱신)** 이 문서는 PostgreSQL 목표(target) 모델 초안이며, 실제 구현 스키마는 `ERD/01_구현스키마_ERD.dbml`을 기준으로 한다(두 문서는 의도적으로 다르다 — `ERD/README.md` 참고). 그중 **OBJ-18 인수인계 위치(`handoff_location`)는 목표 모델 후보가 아니라 폐기된 설계다.** 인수인계 확인 시점마다 위치를 자동 기록하는 기능은 개인정보(위치정보) 수집을 최소화하기 위해 실제 서비스 범위에서 제외하기로 확정했고(`기능요구사항명세서.md` FR-024·025, `비기능요구사항명세서.md` NFR-024 결번 참고), 이후에도 다시 추가할 계획이 없다.

## 2. 객체 목록  

| 객체 ID논리 객체물리 객체명설명근거 |             |                           |                                    |                                  |
| -------------------- | ----------- | ------------------------- | ---------------------------------- | -------------------------------- |
| OBJ-01               | 계정          | `account`                 | 로그인 주체와 ThinQ 계정 연결의 기준            | FR-001, NFR-008                  |
| OBJ-02               | 가족 그룹       | `family_group`            | 가족 단위의 데이터 경계(테넌트)                 | FR-001, NFR-007                  |
| OBJ-03               | 가족 구성원      | `family_member`           | 가족 그룹에 참여한 보호자·돌봄 참여자·자녀의 참여 관계    | FR-001\~003                      |
| OBJ-04               | 자녀          | `child`                   | 돌봄 대상 아동의 기본 프로필                   | FR-001, NFR-010                  |
| OBJ-05               | 가족 초대       | `family_invitation`       | 이메일·전화번호 기반 초대와 수락 상태              | FR-001, NFR-007                  |
| OBJ-06               | 정보 공개 권한    | `family_data_permission`  | 구성원별 자녀·위치·건강/특이사항 접근 범위           | FR-002, FR-012, NFR-009          |
| OBJ-07               | 구독 플랜       | `subscription_plan`       | 무료·유료 기능과 인원/사용량 정책 정의             | FR-003\~004                      |
| OBJ-08               | 구독          | `subscription`            | 가족 그룹의 현재·과거 플랜 가입 상태              | FR-004, NFR-022\~023             |
| OBJ-09               | 결제 거래       | `payment_transaction`     | PG/앱스토어 결제 결과와 외부 거래 식별자           | FR-004, NFR-022                  |
| OBJ-10               | 캘린더 연동      | `calendar_integration`    | 외부·내장 캘린더 OAuth 연결 및 동기화 상태        | FR-005, NFR-014                  |
| OBJ-11               | 개인 일정       | `personal_schedule`       | 근무·회의 등 사용자의 개인 일정                 | FR-006\~007, FR-014              |
| OBJ-12               | 돌봄 정보 수집    | `care_intake`             | Family Inbox 원문 입력과 입력 채널          | FR-008\~010                      |
| OBJ-13               | 구조화 돌봄 항목   | `care_item`               | 원문에서 추출한 일정·준비물·할 일·변경사항           | FR-010\~011                      |
| OBJ-14               | 역할 배정       | `care_assignment`         | 돌봄 항목을 가족 구성원에게 배정한 결과             | FR-011\~013                      |
| OBJ-15               | 예외 상황       | `care_exception`          | 충돌 감지 또는 긴급 도움 요청으로 시작된 조율 건       | FR-014\~020                      |
| OBJ-16               | 대안 제안       | `care_alternative`        | 예외 상황에 대해 제시된 담당자·시간 대안과 승인 결과     | FR-015\~017                      |
| OBJ-17               | 인수인계        | `care_handoff`            | 담당자 전환 시 맥락 전달과 확인 상태              | FR-021\~024                      |
| OBJ-18               | 인수인계 위치 (**폐기**) | `handoff_location`        | 인수인계 확인 시점의 위치 기록 — 개인정보 최소화를 위해 서비스 범위에서 제외 확정         | FR-024\~025, NFR-024             |
| OBJ-19               | 돌봄 완료       | `care_completion`         | 배정된 돌봄 항목의 완료 상태와 체크인              | FR-026\~028                      |
| OBJ-20               | 완료 특이사항     | `care_note`               | 완료 시 수기·음성으로 남긴 특이사항               | FR-023, FR-022                   |
| OBJ-21               | 미디어 자산      | `media_asset`             | OCR 원본, 완료 사진, 음성 등 파일 메타데이터       | FR-009, FR-023, FR-027, NFR-010  |
| OBJ-22               | 알림          | `notification`            | 앱·가전 채널로 발송되는 이벤트 알림과 재알림 상태       | FR-012, FR-017, FR-028\~031      |
| OBJ-23               | 알림 설정       | `notification_preference` | 구성원별 앱·가전 알림 수신 설정                 | FR-032                           |
| OBJ-24               | ThinQ 가전 연동 | `appliance_integration`   | 연동 가전과 재실·온라인 상태                   | FR-030\~031                      |
| OBJ-25               | 기능 사용량      | `feature_usage_daily`     | OCR 횟수·AI 토큰 등 일일 한도 집계            | FR-009, FR-018, NFR-026, NFR-028 |
| OBJ-26               | AI 대화       | `ai_conversation`         | AI 에이전트 질의 세션                      | FR-018                           |
| OBJ-27               | AI 메시지      | `ai_message`              | AI 대화의 사용자·에이전트 메시지와 토큰량           | FR-018, NFR-026                  |
| OBJ-28               | 돌봄 공백 예측    | `care_gap_prediction`     | 학사 일정 등으로 예측한 공백과 D-day            | FR-033                           |
| OBJ-29               | 돌봄 프로그램·제도  | `care_program`            | 지역 기반 대체 프로그램·공공 돌봄 제도 카탈로그        | FR-033, FR-035                   |
| OBJ-30               | 모음ZIP      | `family_album`            | 가족 그룹과 자녀별 공유 앨범                   | FR-034, NFR-025                  |
| OBJ-31               | 앨범 미디어      | `album_media`             | 앨범과 미디어 자산의 연결                     | FR-034                           |
| OBJ-32               | 개인정보 동의     | `consent_record`          | 위치·아동정보·사진 등 수집·이용 동의 이력           | NFR-010\~012, NFR-024\~025       |
| OBJ-33               | 감사 로그       | `audit_log`               | 권한·개인정보·결제·상태 변경의 추적 이력            | NFR-006\~012, NFR-022            |
| OBJ-34               | 돌봄 추천       | `care_recommendation`     | 공백 예측 또는 지역 조건에 따라 프로그램·제도를 추천한 결과 | FR-033, FR-035                   |

## 3. 객체별 속성 정의

### OBJ-01 계정 (`account`)

| 속성명물리명타입NULL식별자기본값비고 |                    |              |   |   |                     |                           |
| -------------------- | ------------------ | ------------ | - | - | ------------------- | ------------------------- |
| 계정 ID                | `account_id`       | uuid         | N | Y | `gen_random_uuid()` | 내부 PK                     |
| ThinQ 계정 ID          | `thinq_account_id` | varchar(100) | Y | Y | -                   | 외부 계정 식별자, 계정 연동 시 unique |
| 로그인 이메일              | `email`            | varchar(254) | Y | N | -                   | 소셜 로그인에서 없을 수 있음          |
| 전화번호                 | `phone_number`     | varchar(30)  | Y | N | -                   | 초대·알림용, 암호화/마스킹 권장        |
| 표시명                  | `display_name`     | varchar(100) | N | N | -                   | 앱 표시용                     |
| 상태                   | `status`           | varchar(20)  | N | N | `'ACTIVE'`          | ACTIVE/LOCKED/DELETED     |
| 최근 로그인 시각            | `last_login_at`    | timestamptz  | Y | N | -                   | 보안·운영용                    |
| 생성 시각                | `created_at`       | timestamptz  | N | N | `now()`             | 감사 공통 컬럼                  |
| 수정 시각                | `updated_at`       | timestamptz  | N | N | `now()`             | 감사 공통 컬럼                  |

### OBJ-02 가족 그룹 (`family_group`)

| 속성명물리명타입NULL식별자기본값비고 |                    |              |   |   |                     |                         |
| -------------------- | ------------------ | ------------ | - | - | ------------------- | ----------------------- |
| 가족 그룹 ID             | `family_group_id`  | uuid         | N | Y | `gen_random_uuid()` | 모든 가족 데이터의 tenant 경계    |
| 그룹명                  | `group_name`       | varchar(100) | N | N | -                   | 가족이 지정하는 이름             |
| 생성자 계정 ID            | `owner_account_id` | uuid         | N | N | -                   | `account.account_id` FK |
| 기본 시간대               | `timezone`         | varchar(50)  | N | N | `'Asia/Seoul'`      | 일정·일일 한도 기준             |
| 상태                   | `status`           | varchar(20)  | N | N | `'ACTIVE'`          | ACTIVE/ARCHIVED         |
| 생성 시각                | `created_at`       | timestamptz  | N | N | `now()`             |                         |
| 수정 시각                | `updated_at`       | timestamptz  | N | N | `now()`             |                         |

### OBJ-03 가족 구성원 (`family_member`)

| 속성명물리명타입NULL식별자기본값비고 |                     |             |   |   |                     |                                      |
| -------------------- | ------------------- | ----------- | - | - | ------------------- | ------------------------------------ |
| 구성원 ID               | `member_id`         | uuid        | N | Y | `gen_random_uuid()` | 내부 PK                                |
| 가족 그룹 ID             | `family_group_id`   | uuid        | N | N | -                   | `family_group` FK                    |
| 계정 ID                | `account_id`        | uuid        | Y | N | -                   | 보호자·돌봄 참여자일 때 연결                     |
| 자녀 ID                | `child_id`          | uuid        | Y | N | -                   | 자녀 참여자일 때 연결                         |
| 구성원 유형               | `member_type`       | varchar(20) | N | N | -                   | ADULT/CHILD                          |
| 기본 역할 코드             | `default_role_code` | varchar(30) | Y | N | -                   | PARENT/GRANDPARENT/CAREGIVER/CHILD 등 |
| 초대 상태                | `membership_status` | varchar(20) | N | N | `'PENDING'`         | PENDING/ACTIVE/REMOVED               |
| 생성 시각                | `created_at`        | timestamptz | N | N | `now()`             |                                      |
| 수정 시각                | `updated_at`        | timestamptz | N | N | `now()`             |                                      |

### OBJ-04 자녀 (`child`)

| 속성명물리명타입NULL식별자기본값비고 |                     |              |   |   |                     |                    |
| -------------------- | ------------------- | ------------ | - | - | ------------------- | ------------------ |
| 자녀 ID                | `child_id`          | uuid         | N | Y | `gen_random_uuid()` | 내부 PK              |
| 가족 그룹 ID             | `family_group_id`   | uuid         | N | N | -                   | 소속 그룹              |
| 이름                   | `name`              | varchar(100) | N | N | -                   | 아동 개인정보            |
| 생년월일                 | `birth_date`        | date         | Y | N | -                   | 최소 수집 원칙 적용        |
| 건강·돌봄 메모             | `care_profile_json` | jsonb        | Y | N | -                   | 건강정보는 별도 암호화·권한 통제 |
| 상태                   | `status`            | varchar(20)  | N | N | `'ACTIVE'`          | ACTIVE/ARCHIVED    |

### OBJ-05 가족 초대 (`family_invitation`)

| 속성명물리명타입NULL식별자기본값비고 |                         |              |   |   |                     |                                  |
| -------------------- | ----------------------- | ------------ | - | - | ------------------- | -------------------------------- |
| 초대 ID                | `invitation_id`         | uuid         | N | Y | `gen_random_uuid()` | 내부 PK                            |
| 가족 그룹 ID             | `family_group_id`       | uuid         | N | N | -                   |                                  |
| 초대자 계정 ID            | `invited_by_account_id` | uuid         | N | N | -                   |                                  |
| 초대 대상 이메일            | `invitee_email`         | varchar(254) | Y | N | -                   | 이메일 또는 전화번호 중 하나                 |
| 초대 대상 전화번호           | `invitee_phone`         | varchar(30)  | Y | N | -                   | 암호화/마스킹 권장                       |
| 토큰 해시                | `invite_token_hash`     | varchar(255) | N | Y | -                   | 원문 토큰 저장 금지                      |
| 만료 시각                | `expires_at`            | timestamptz  | N | N | -                   |                                  |
| 상태                   | `status`                | varchar(20)  | N | N | `'PENDING'`         | PENDING/ACCEPTED/EXPIRED/REVOKED |
| 수락 계정 ID             | `accepted_account_id`   | uuid         | Y | N | -                   | 수락 전 NULL                        |

### OBJ-06 정보 공개 권한 (`family_data_permission`)

| 속성명물리명타입NULL식별자기본값비고 |                     |             |   |   |                     |                                          |
| -------------------- | ------------------- | ----------- | - | - | ------------------- | ---------------------------------------- |
| 권한 ID                | `permission_id`     | uuid        | N | Y | `gen_random_uuid()` |                                          |
| 가족 그룹 ID             | `family_group_id`   | uuid        | N | N | -                   |                                          |
| 대상 구성원 ID            | `subject_member_id` | uuid        | N | N | -                   | 정보를 보는 구성원                               |
| 자녀 ID                | `child_id`          | uuid        | Y | N | -                   | 특정 자녀 범위                                 |
| 정보 범위 코드             | `scope_code`        | varchar(30) | N | N | -                   | CHILD\_DETAIL/LOCATION/HEALTH/NOTE/PHOTO |
| 허용 여부                | `is_allowed`        | boolean     | N | N | `false`             | 명시적 거부 우선                                |
| 만료 시각                | `expires_at`        | timestamptz | Y | N | -                   | 기간 권한이 없으면 NULL                          |

### OBJ-07 구독 플랜 (`subscription_plan`)

| 속성명물리명타입NULL식별자기본값비고 |                        |              |   |   |                     |              |
| -------------------- | ---------------------- | ------------ | - | - | ------------------- | ------------ |
| 플랜 ID                | `plan_id`              | uuid         | N | Y | `gen_random_uuid()` |              |
| 플랜 코드                | `plan_code`            | varchar(30)  | N | Y | -                   | FREE/PREMIUM |
| 플랜명                  | `plan_name`            | varchar(100) | N | N | -                   |              |
| 보호자 최대 인원            | `max_adult_members`    | integer      | N | N | `3`                 | 무료 플랜 정책 기준  |
| 자녀 최대 인원             | `max_children`         | integer      | N | N | `2`                 |              |
| OCR 일일 무료 한도         | `ocr_daily_limit`      | integer      | N | N | `2`                 |              |
| AI 토큰 일일 한도          | `ai_daily_token_limit` | integer      | N | N | `10000`             | 입력+출력 합산     |
| 유효 여부                | `is_active`            | boolean      | N | N | `true`              | 정책 버전 관리용    |

### OBJ-08 구독 (`subscription`)

| 속성명물리명타입NULL식별자기본값비고 |                            |              |   |   |                     |                                 |
| -------------------- | -------------------------- | ------------ | - | - | ------------------- | ------------------------------- |
| 구독 ID                | `subscription_id`          | uuid         | N | Y | `gen_random_uuid()` |                                 |
| 가족 그룹 ID             | `family_group_id`          | uuid         | N | N | -                   | 그룹 단위 구독                        |
| 플랜 ID                | `plan_id`                  | uuid         | N | N | -                   |                                 |
| 상태                   | `status`                   | varchar(20)  | N | N | `'ACTIVE'`          | TRIAL/ACTIVE/PAST\_DUE/CANCELED |
| 시작 시각                | `started_at`               | timestamptz  | N | N | `now()`             |                                 |
| 종료 예정 시각             | `ends_at`                  | timestamptz  | Y | N | -                   |                                 |
| 외부 구독 ID             | `external_subscription_id` | varchar(150) | Y | Y | -                   | PG/앱스토어 식별자                     |

### OBJ-09 결제 거래 (`payment_transaction`)

| 속성명물리명타입NULL식별자기본값비고 |                           |               |   |   |                     |                              |
| -------------------- | ------------------------- | ------------- | - | - | ------------------- | ---------------------------- |
| 결제 거래 ID             | `payment_transaction_id`  | uuid          | N | Y | `gen_random_uuid()` |                              |
| 구독 ID                | `subscription_id`         | uuid          | N | N | -                   |                              |
| 외부 거래 ID             | `external_transaction_id` | varchar(150)  | N | Y | -                   | PG/앱스토어 키, unique            |
| 결제 금액                | `amount`                  | numeric(12,2) | N | N | `0`                 | 카드 원본정보 저장 금지                |
| 통화                   | `currency`                | char(3)       | N | N | `'KRW'`             |                              |
| 결제 상태                | `status`                  | varchar(20)   | N | N | `'PENDING'`         | PENDING/PAID/FAILED/REFUNDED |
| 결제 시각                | `paid_at`                 | timestamptz   | Y | N | -                   |                              |

### OBJ-10 캘린더 연동 (`calendar_integration`)

| 속성명물리명타입NULL식별자기본값비고 |                           |              |   |   |                     |                         |
| -------------------- | ------------------------- | ------------ | - | - | ------------------- | ----------------------- |
| 연동 ID                | `calendar_integration_id` | uuid         | N | Y | `gen_random_uuid()` |                         |
| 계정 ID                | `account_id`              | uuid         | N | N | -                   |                         |
| 제공자 코드               | `provider_code`           | varchar(30)  | N | N | -                   | GOOGLE/MICROSOFT/APPLE/INTERNAL 등 |
| 외부 캘린더 ID            | `external_calendar_id`    | varchar(200) | N | Y | -                   |                         |
| 토큰 참조                | `credential_ref`          | varchar(255) | N | N | -                   | 실제 토큰은 보안 저장소           |
| 동기화 상태               | `sync_status`             | varchar(20)  | N | N | `'PENDING'`         | PENDING/SYNCED/ERROR    |
| 마지막 동기화 시각           | `last_synced_at`          | timestamptz  | Y | N | -                   |                         |
| 오류 메시지               | `last_error_message`      | text         | Y | N | -                   | 민감정보 제외                 |

### OBJ-11 개인 일정 (`personal_schedule`)

| 속성명물리명타입NULL식별자기본값비고 |                           |              |   |   |                     |                   |
| -------------------- | ------------------------- | ------------ | - | - | ------------------- | ----------------- |
| 개인 일정 ID             | `personal_schedule_id`    | uuid         | N | Y | `gen_random_uuid()` |                   |
| 가족 그룹 ID             | `family_group_id`         | uuid         | N | N | -                   | 충돌 감지의 데이터 경계     |
| 작성자 구성원 ID           | `created_by_member_id`    | uuid         | N | N | -                   |                   |
| 캘린더 연동 ID            | `calendar_integration_id` | uuid         | Y | N | -                   | 수기 입력은 NULL       |
| 외부 일정 ID             | `external_event_id`       | varchar(200) | Y | Y | -                   | 연동 일정인 경우         |
| 제목                   | `title`                   | varchar(200) | N | N | -                   |                   |
| 시작 시각                | `starts_at`               | timestamptz  | N | N | -                   |                   |
| 종료 시각                | `ends_at`                 | timestamptz  | N | N | -                   |                   |
| 입력 방식                | `input_type`              | varchar(20)  | N | N | `'MANUAL'`          | MANUAL/VOICE/SYNC |
| 상태                   | `status`                  | varchar(20)  | N | N | `'ACTIVE'`          |                   |

### OBJ-12 돌봄 정보 수집 (`care_intake`)

| 속성명물리명타입NULL식별자기본값비고 |                          |             |   |   |                     |                            |
| -------------------- | ------------------------ | ----------- | - | - | ------------------- | -------------------------- |
| 수집 ID                | `care_intake_id`         | uuid        | N | Y | `gen_random_uuid()` |                            |
| 가족 그룹 ID             | `family_group_id`        | uuid        | N | N | -                   |                            |
| 제출 구성원 ID            | `submitted_by_member_id` | uuid        | N | N | -                   |                            |
| 입력 방식                | `input_type`             | varchar(20) | N | N | -                   | TEXT/PHOTO/VOICE           |
| 원문 내용                | `raw_content`            | text        | Y | N | -                   | 음성·사진은 미디어 참조 가능           |
| 원본 미디어 ID            | `source_media_id`        | uuid        | Y | N | -                   | OCR/음성 원본                  |
| 처리 상태                | `processing_status`      | varchar(20) | N | N | `'RECEIVED'`        | RECEIVED/STRUCTURED/FAILED |
| 구조화 결과               | `structured_result_json` | jsonb       | Y | N | -                   | 모델 결과 원문 보관용               |
| 처리 오류                | `error_code`             | varchar(50) | Y | N | -                   |                            |

### OBJ-13 구조화 돌봄 항목 (`care_item`)

| 속성명물리명타입NULL식별자기본값비고 |                   |              |   |   |                     |                             |
| -------------------- | ----------------- | ------------ | - | - | ------------------- | --------------------------- |
| 돌봄 항목 ID             | `care_item_id`    | uuid         | N | Y | `gen_random_uuid()` |                             |
| 수집 ID                | `care_intake_id`  | uuid         | N | N | -                   | Family Inbox 원문             |
| 가족 그룹 ID             | `family_group_id` | uuid         | N | N | -                   | 조회·권한 경계                    |
| 자녀 ID                | `child_id`        | uuid         | Y | N | -                   | 여러 자녀 공통이면 NULL 가능          |
| 항목 유형                | `item_type`       | varchar(30)  | N | N | -                   | SCHEDULE/SUPPLY/TODO/CHANGE |
| 제목                   | `title`           | varchar(200) | N | N | -                   |                             |
| 상세 내용                | `description`     | text         | Y | N | -                   |                             |
| 예정 시작 시각             | `starts_at`       | timestamptz  | Y | N | -                   |                             |
| 예정 종료 시각             | `ends_at`         | timestamptz  | Y | N | -                   |                             |
| 장소                   | `location_text`   | varchar(255) | Y | N | -                   |                             |
| 상태                   | `status`          | varchar(20)  | N | N | `'OPEN'`            | OPEN/ASSIGNED/DONE/CANCELED |

### OBJ-14 역할 배정 (`care_assignment`)

| 속성명물리명타입NULL식별자기본값비고 |                         |             |   |   |                     |                              |
| -------------------- | ----------------------- | ----------- | - | - | ------------------- | ---------------------------- |
| 배정 ID                | `assignment_id`         | uuid        | N | Y | `gen_random_uuid()` |                              |
| 돌봄 항목 ID             | `care_item_id`          | uuid        | N | N | -                   |                              |
| 담당 구성원 ID            | `assignee_member_id`    | uuid        | N | N | -                   |                              |
| 배정자 구성원 ID           | `assigned_by_member_id` | uuid        | Y | N | -                   | AI 자동 배정이면 NULL 가능           |
| 배정 출처                | `assignment_source`     | varchar(20) | N | N | `'ROLE_MATCH'`      | ROLE\_MATCH/MANUAL/EXCEPTION |
| 승인 상태                | `approval_status`       | varchar(20) | N | N | `'PENDING'`         | PENDING/APPROVED/REJECTED    |
| 배정 상태                | `status`                | varchar(20) | N | N | `'ASSIGNED'`        | ASSIGNED/ACCEPTED/CANCELED   |
| 승인 시각                | `approved_at`           | timestamptz | Y | N | -                   |                              |

### OBJ-15 예외 상황 (`care_exception`)

| 속성명물리명타입NULL식별자기본값비고 |                          |             |   |   |                     |                                    |
| -------------------- | ------------------------ | ----------- | - | - | ------------------- | ---------------------------------- |
| 예외 ID                | `exception_id`           | uuid        | N | Y | `gen_random_uuid()` |                                    |
| 가족 그룹 ID             | `family_group_id`        | uuid        | N | N | -                   |                                    |
| 돌봄 항목 ID             | `care_item_id`           | uuid        | Y | N | -                   | 관련 돌봄 일정                           |
| 개인 일정 ID             | `personal_schedule_id`   | uuid        | Y | N | -                   | 충돌 감지 원인                           |
| 요청자 구성원 ID           | `requested_by_member_id` | uuid        | Y | N | -                   | 자동 충돌 감지는 NULL, 긴급 요청은 요청자 저장      |
| 트리거 유형               | `trigger_type`           | varchar(30) | N | N | -                   | SCHEDULE\_CONFLICT/URGENT\_REQUEST |
| 내용                   | `description`            | text        | Y | N | -                   |                                    |
| 상태                   | `status`                 | varchar(20) | N | N | `'OPEN'`            | OPEN/PROPOSED/RESOLVED/CANCELED    |
| 발생 시각                | `detected_at`            | timestamptz | N | N | `now()`             |                                    |
| 해결 시각                | `resolved_at`            | timestamptz | Y | N | -                   |                                    |

### OBJ-16 대안 제안 (`care_alternative`)

| 속성명물리명타입NULL식별자기본값비고 |                        |             |   |   |                     |                                   |
| -------------------- | ---------------------- | ----------- | - | - | ------------------- | --------------------------------- |
| 대안 ID                | `alternative_id`       | uuid        | N | Y | `gen_random_uuid()` |                                   |
| 예외 ID                | `exception_id`         | uuid        | N | N | -                   |                                   |
| 후보 구성원 ID            | `candidate_member_id`  | uuid        | N | N | -                   |                                   |
| 제안 시작 시각             | `proposed_starts_at`   | timestamptz | Y | N | -                   |                                   |
| 제안 종료 시각             | `proposed_ends_at`     | timestamptz | Y | N | -                   |                                   |
| 추천 근거                | `reason_json`          | jsonb       | Y | N | -                   | 충돌·가능 시간·역할 패턴                    |
| 승인 상태                | `decision`             | varchar(20) | N | N | `'PENDING'`         | PENDING/APPROVED/REJECTED/EXPIRED |
| 결정자 구성원 ID           | `decided_by_member_id` | uuid        | Y | N | -                   |                                   |
| 결정 시각                | `decided_at`           | timestamptz | Y | N | -                   |                                   |

### OBJ-17 인수인계 (`care_handoff`)

| 속성명물리명타입NULL식별자기본값비고 |                      |             |   |   |                     |                           |
| -------------------- | -------------------- | ----------- | - | - | ------------------- | ------------------------- |
| 인수인계 ID              | `handoff_id`         | uuid        | N | Y | `gen_random_uuid()` |                           |
| 돌봄 항목 ID             | `care_item_id`       | uuid        | N | N | -                   |                           |
| 이전 담당 배정 ID          | `from_assignment_id` | uuid        | Y | N | -                   |                           |
| 신규 담당 배정 ID          | `to_assignment_id`   | uuid        | N | N | -                   |                           |
| 맥락 요약                | `context_summary`    | text        | N | N | -                   | 시간·장소·준비물·특이사항 요약         |
| 상태                   | `status`             | varchar(20) | N | N | `'PENDING'`         | PENDING/CONFIRMED/EXPIRED |
| 전달 시각                | `transferred_at`     | timestamptz | N | N | `now()`             |                           |
| 확인 시각                | `confirmed_at`       | timestamptz | Y | N | -                   |                           |

### OBJ-18 인수인계 위치 (`handoff_location`) — **폐기, 구현하지 않음**

> 개인정보(위치정보) 수집 최소화를 위해 실제 서비스 범위에서 제외하기로 확정한 설계다. 아래 속성 정의는 과거 기록으로만 남겨둔다.

| 속성명물리명타입NULL식별자기본값비고 |                          |              |   |   |                         |                |
| -------------------- | ------------------------ | ------------ | - | - | ----------------------- | -------------- |
| 위치 기록 ID             | `handoff_location_id`    | uuid         | N | Y | `gen_random_uuid()`     |                |
| 인수인계 ID              | `handoff_id`             | uuid         | N | N | -                       |                |
| 확인 구성원 ID            | `confirmed_by_member_id` | uuid         | N | N | -                       |                |
| 위도                   | `latitude`               | numeric(9,6) | N | N | -                       | 암호화·접근통제 필요    |
| 경도                   | `longitude`              | numeric(9,6) | N | N | -                       |                |
| 정확도 미터               | `accuracy_m`             | numeric(8,2) | Y | N | -                       |                |
| 개인정보 동의 ID           | `consent_id`             | uuid         | N | N | -                       | 유효한 위치정보 동의 근거 |
| 기록 시각                | `captured_at`            | timestamptz  | N | N | `now()`                 | 보관 최대 90일 정책   |
| 삭제 예정 시각             | `retention_expires_at`   | timestamptz  | N | N | `captured_at + 90 days` | NFR-024        |

### OBJ-19 돌봄 완료 (`care_completion`)

| 속성명물리명타입NULL식별자기본값비고 |                          |             |   |   |                     |                    |
| -------------------- | ------------------------ | ----------- | - | - | ------------------- | ------------------ |
| 완료 ID                | `completion_id`          | uuid        | N | Y | `gen_random_uuid()` |                    |
| 배정 ID                | `assignment_id`          | uuid        | N | N | -                   | 배정당 완료 0\~1건       |
| 완료 처리자 구성원 ID        | `completed_by_member_id` | uuid        | N | N | -                   |                    |
| 완료 상태                | `status`                 | varchar(20) | N | N | `'COMPLETED'`       | COMPLETED/REOPENED |
| 특이사항 여부              | `has_note`               | boolean     | N | N | `false`             | 팝업 분기 결과           |
| 체크인 미디어 ID           | `proof_media_id`         | uuid        | Y | N | -                   | 선택적 완료 사진          |
| 완료 시각                | `completed_at`           | timestamptz | N | N | `now()`             |                    |

### OBJ-20 완료 특이사항 (`care_note`)

| 속성명물리명타입NULL식별자기본값비고 |                        |             |   |   |                     |             |
| -------------------- | ---------------------- | ----------- | - | - | ------------------- | ----------- |
| 특이사항 ID              | `care_note_id`         | uuid        | N | Y | `gen_random_uuid()` |             |
| 완료 ID                | `completion_id`        | uuid        | N | N | -                   |             |
| 작성자 구성원 ID           | `created_by_member_id` | uuid        | N | N | -                   |             |
| 입력 방식                | `input_type`           | varchar(20) | N | N | -                   | TEXT/VOICE  |
| 내용                   | `content`              | text        | N | N | -                   | 다음 인수인계에 반영 |
| 원본 미디어 ID            | `source_media_id`      | uuid        | Y | N | -                   | 음성 원본       |
| 생성 시각                | `created_at`           | timestamptz | N | N | `now()`             |             |

### OBJ-21 미디어 자산 (`media_asset`)

| 속성명물리명타입NULL식별자기본값비고 |                         |              |   |   |                     |                            |
| -------------------- | ----------------------- | ------------ | - | - | ------------------- | -------------------------- |
| 미디어 ID               | `media_asset_id`        | uuid         | N | Y | `gen_random_uuid()` |                            |
| 가족 그룹 ID             | `family_group_id`       | uuid         | N | N | -                   | 접근 경계                      |
| 업로더 구성원 ID           | `uploaded_by_member_id` | uuid         | N | N | -                   |                            |
| 미디어 유형               | `media_type`            | varchar(20)  | N | N | -                   | IMAGE/AUDIO                |
| 저장소 키                | `storage_key`           | varchar(500) | N | Y | -                   | 실제 바이너리는 오브젝트 스토리지         |
| MIME 타입              | `mime_type`             | varchar(100) | N | N | -                   |                            |
| 파일 해시                | `content_sha256`        | char(64)     | N | N | -                   | 중복·무결성 확인                  |
| 보관 만료 시각             | `retention_expires_at`  | timestamptz  | Y | N | -                   | 아동 사진·음성 보관 정책             |
| 상태                   | `status`                | varchar(20)  | N | N | `'ACTIVE'`          | ACTIVE/DELETED/QUARANTINED |

### OBJ-22 알림 (`notification`)

| 속성명물리명타입NULL식별자기본값비고 |                            |              |   |   |                     |                                                |
| -------------------- | -------------------------- | ------------ | - | - | ------------------- | ---------------------------------------------- |
| 알림 ID                | `notification_id`          | uuid         | N | Y | `gen_random_uuid()` |                                                |
| 가족 그룹 ID             | `family_group_id`          | uuid         | N | N | -                   |                                                |
| 수신 구성원 ID            | `recipient_member_id`      | uuid         | N | N | -                   | 관련자 한정 통보                                      |
| 이벤트 유형               | `event_type`               | varchar(40)  | N | N | -                   | INTAKE/ASSIGNMENT/HANDOFF/COMPLETION/EXCEPTION |
| 채널                   | `channel`                  | varchar(20)  | N | N | `'APP_PUSH'`        | APP\_PUSH/APPLIANCE                            |
| 제목                   | `title`                    | varchar(200) | N | N | -                   |                                                |
| 본문                   | `body`                     | varchar(500) | N | N | -                   | NFR-018 100자 권장                                |
| 상태                   | `status`                   | varchar(20)  | N | N | `'PENDING'`         | PENDING/SENT/FAILED/READ                       |
| 에스컬레이션 단계            | `escalation_level`         | integer      | N | N | `0`                 | 미승인 재알림 단계                                     |
| 예약 시각                | `scheduled_at`             | timestamptz  | Y | N | -                   |                                                |
| 발송 시각                | `sent_at`                  | timestamptz  | Y | N | -                   |                                                |
| 관련 객체 유형             | `target_type`              | varchar(40)  | Y | N | -                   | polymorphic reference 보조값                      |
| 관련 객체 ID             | `target_id`                | uuid         | Y | N | -                   | 상세 FK는 이벤트별로 검증                                |
| 대상 가전 연동 ID          | `appliance_integration_id` | uuid         | Y | N | -                   | 가전 채널일 때만 사용                                   |
| 재시도 횟수               | `retry_count`              | integer      | N | N | `0`                 | 채널 장애 재시도                                      |
| 마지막 오류 코드            | `last_error_code`          | varchar(50)  | Y | N | -                   | 민감정보 제외                                        |

### OBJ-23 알림 설정 (`notification_preference`)

| 속성명물리명타입NULL식별자기본값비고 |                              |             |   |   |                     |                |
| -------------------- | ---------------------------- | ----------- | - | - | ------------------- | -------------- |
| 설정 ID                | `notification_preference_id` | uuid        | N | Y | `gen_random_uuid()` |                |
| 구성원 ID               | `member_id`                  | uuid        | N | N | -                   | 구성원별 1건        |
| 앱 알림 허용              | `app_push_enabled`           | boolean     | N | N | `true`              |                |
| 가전 알림 허용             | `appliance_enabled`          | boolean     | N | N | `false`             | 유료 기능·연동 상태 확인 |
| 미승인 재알림 허용           | `escalation_enabled`         | boolean     | N | N | `true`              |                |
| 수정 시각                | `updated_at`                 | timestamptz | N | N | `now()`             |                |

### OBJ-24 ThinQ 가전 연동 (`appliance_integration`)

| 속성명물리명타입NULL식별자기본값비고 |                            |              |   |   |                     |                                     |
| -------------------- | -------------------------- | ------------ | - | - | ------------------- | ----------------------------------- |
| 가전 연동 ID             | `appliance_integration_id` | uuid         | N | Y | `gen_random_uuid()` |                                     |
| 가족 그룹 ID             | `family_group_id`          | uuid         | N | N | -                   |                                     |
| 계정 ID                | `account_id`               | uuid         | N | N | -                   | 소유 계정                               |
| ThinQ 기기 ID          | `thinq_device_id`          | varchar(150) | N | Y | -                   | 외부 기기 식별자                           |
| 기기 유형                | `device_type`              | varchar(30)  | N | N | -                   | TV/WATER\_PURIFIER/ROBOT\_CLEANER 등 |
| 온라인 상태               | `online_status`            | varchar(20)  | N | N | `'UNKNOWN'`         | ONLINE/OFFLINE/UNKNOWN              |
| 사용 중 여부              | `in_use`                   | boolean      | N | N | `false`             | 알림 채널 선택 근거                         |
| 재실 감지 시각             | `presence_checked_at`      | timestamptz  | Y | N | -                   |                                     |
| 연동 상태                | `status`                   | varchar(20)  | N | N | `'ACTIVE'`          |                                     |

### OBJ-25 기능 사용량 (`feature_usage_daily`)

| 속성명물리명타입NULL식별자기본값비고 |                |             |   |   |                     |                           |
| -------------------- | -------------- | ----------- | - | - | ------------------- | ------------------------- |
| 사용량 ID               | `usage_id`     | uuid        | N | Y | `gen_random_uuid()` |                           |
| 계정 ID                | `account_id`   | uuid        | N | N | -                   | 사용자별 한도                   |
| 사용일                  | `usage_date`   | date        | N | N | `current_date`      | 그룹 시간대 기준 변환 필요           |
| 기능 코드                | `feature_code` | varchar(30) | N | N | -                   | OCR/AI\_CHAT/VOICE\_INPUT |
| 사용량                  | `usage_value`  | bigint      | N | N | `0`                 | OCR은 횟수, AI는 토큰           |
| 한도                   | `limit_value`  | bigint      | Y | N | -                   | 유료 무제한은 NULL 가능           |
| 마지막 반영 시각            | `updated_at`   | timestamptz | N | N | `now()`             | 오차율 0% 요구                 |

### OBJ-26 AI 대화 (`ai_conversation`)

| 속성명물리명타입NULL식별자기본값비고 |                         |              |   |   |                     |             |
| -------------------- | ----------------------- | ------------ | - | - | ------------------- | ----------- |
| 대화 ID                | `conversation_id`       | uuid         | N | Y | `gen_random_uuid()` |             |
| 가족 그룹 ID             | `family_group_id`       | uuid         | N | N | -                   |             |
| 시작 계정 ID             | `started_by_account_id` | uuid         | N | N | -                   |             |
| 제목                   | `title`                 | varchar(200) | Y | N | -                   | 자동 생성 가능    |
| 상태                   | `status`                | varchar(20)  | N | N | `'OPEN'`            | OPEN/CLOSED |
| 시작 시각                | `started_at`            | timestamptz  | N | N | `now()`             |             |
| 종료 시각                | `closed_at`             | timestamptz  | Y | N | -                   |             |

### OBJ-27 AI 메시지 (`ai_message`)

| 속성명물리명타입NULL식별자기본값비고 |                   |             |   |   |                     |                       |
| -------------------- | ----------------- | ----------- | - | - | ------------------- | --------------------- |
| 메시지 ID               | `message_id`      | uuid        | N | Y | `gen_random_uuid()` |                       |
| 대화 ID                | `conversation_id` | uuid        | N | N | -                   |                       |
| 발화 주체                | `role`            | varchar(20) | N | N | -                   | USER/ASSISTANT/SYSTEM |
| 내용                   | `content`         | text        | N | N | -                   | 민감정보 마스킹·보관정책 적용      |
| 입력 토큰 수              | `input_tokens`    | integer     | N | N | `0`                 |                       |
| 출력 토큰 수              | `output_tokens`   | integer     | N | N | `0`                 |                       |
| 실행 제안                | `action_json`     | jsonb       | Y | N | -                   | 일정·조율 조치 제안           |
| 생성 시각                | `created_at`      | timestamptz | N | N | `now()`             |                       |

### OBJ-28 돌봄 공백 예측 (`care_gap_prediction`)

| 속성명물리명타입NULL식별자기본값비고 |                      |             |   |   |                     |                           |
| -------------------- | -------------------- | ----------- | - | - | ------------------- | ------------------------- |
| 예측 ID                | `prediction_id`      | uuid        | N | Y | `gen_random_uuid()` |                           |
| 가족 그룹 ID             | `family_group_id`    | uuid        | N | N | -                   |                           |
| 자녀 ID                | `child_id`           | uuid        | Y | N | -                   |                           |
| 기준 일정 ID             | `source_schedule_id` | uuid        | Y | N | -                   | 학사 일정 등 외부 데이터            |
| 공백 시작일               | `gap_start_date`     | date        | N | N | -                   |                           |
| 공백 종료일               | `gap_end_date`       | date        | Y | N | -                   |                           |
| D-day                | `dday`               | integer     | N | N | -                   | 계산 결과 캐시                  |
| 상태                   | `status`             | varchar(20) | N | N | `'PREDICTED'`       | PREDICTED/VIEWED/RESOLVED |

### OBJ-29 돌봄 프로그램·제도 (`care_program`)

| 속성명물리명타입NULL식별자기본값비고 |                     |              |   |   |                     |                                  |
| -------------------- | ------------------- | ------------ | - | - | ------------------- | -------------------------------- |
| 프로그램 ID              | `program_id`        | uuid         | N | Y | `gen_random_uuid()` |                                  |
| 프로그램 유형              | `program_type`      | varchar(30)  | N | N | -                   | ALTERNATIVE\_CARE/PUBLIC\_POLICY |
| 프로그램명                | `name`              | varchar(200) | N | N | -                   |                                  |
| 제공 기관                | `provider_name`     | varchar(200) | Y | N | -                   |                                  |
| 지역 코드                | `region_code`       | varchar(20)  | Y | N | -                   | 위치 기반 필터                         |
| 상세 URL               | `detail_url`        | varchar(500) | Y | N | -                   | 외부 원문 링크                         |
| 유효 시작일               | `valid_from`        | date         | Y | N | -                   |                                  |
| 유효 종료일               | `valid_to`          | date         | Y | N | -                   |                                  |
| 원천 갱신 시각             | `source_updated_at` | timestamptz  | Y | N | -                   | 캐시·갱신 실패 대응                      |

### OBJ-30 모음ZIP (`family_album`)

| 속성명물리명타입NULL식별자기본값비고 |                        |              |   |   |                     |                      |
| -------------------- | ---------------------- | ------------ | - | - | ------------------- | -------------------- |
| 앨범 ID                | `album_id`             | uuid         | N | Y | `gen_random_uuid()` |                      |
| 가족 그룹 ID             | `family_group_id`      | uuid         | N | N | -                   |                      |
| 자녀 ID                | `child_id`             | uuid         | Y | N | -                   | 자녀별 앨범, NULL이면 가족 공용 |
| 앨범명                  | `album_name`           | varchar(100) | N | N | -                   |                      |
| 생성자 구성원 ID           | `created_by_member_id` | uuid         | N | N | -                   |                      |
| 상태                   | `status`               | varchar(20)  | N | N | `'ACTIVE'`          |                      |

### OBJ-31 앨범 미디어 (`album_media`)

| 속성명물리명타입NULL식별자기본값비고 |                  |              |   |   |                     |              |
| -------------------- | ---------------- | ------------ | - | - | ------------------- | ------------ |
| 앨범 미디어 ID            | `album_media_id` | uuid         | N | Y | `gen_random_uuid()` |              |
| 앨범 ID                | `album_id`       | uuid         | N | N | -                   |              |
| 미디어 ID               | `media_asset_id` | uuid         | N | N | -                   |              |
| 캡션                   | `caption`        | varchar(500) | Y | N | -                   |              |
| 공개 시각                | `published_at`   | timestamptz  | N | N | `now()`             | 초대된 가족에게만 노출 |

### OBJ-32 개인정보 동의 (`consent_record`)

| 속성명물리명타입NULL식별자기본값비고 |                          |             |   |   |                     |                                         |
| -------------------- | ------------------------ | ----------- | - | - | ------------------- | --------------------------------------- |
| 동의 ID                | `consent_id`             | uuid        | N | Y | `gen_random_uuid()` |                                         |
| 동의자 구성원 ID           | `consented_by_member_id` | uuid        | N | N | -                   | 보호자 동의 주체                               |
| 가족 그룹 ID             | `family_group_id`        | uuid        | N | N | -                   |                                         |
| 자녀 ID                | `child_id`               | uuid        | Y | N | -                   | 아동정보 동의인 경우                             |
| 동의 유형                | `consent_type`           | varchar(40) | N | N | -                   | LOCATION/CHILD\_DATA/PHOTO/THIRD\_PARTY |
| 정책 버전                | `policy_version`         | varchar(30) | N | N | -                   | 당시 약관 버전                                |
| 동의 여부                | `is_granted`             | boolean     | N | N | `false`             |                                         |
| 동의 시각                | `granted_at`             | timestamptz | Y | N | -                   |                                         |
| 철회 시각                | `revoked_at`             | timestamptz | Y | N | -                   |                                         |

### OBJ-33 감사 로그 (`audit_log`)

| 속성명물리명타입NULL식별자기본값비고 |                    |             |   |   |                     |                                     |
| -------------------- | ------------------ | ----------- | - | - | ------------------- | ----------------------------------- |
| 감사 로그 ID             | `audit_log_id`     | uuid        | N | Y | `gen_random_uuid()` | append-only 권장                      |
| 가족 그룹 ID             | `family_group_id`  | uuid        | Y | N | -                   | 계정 전역 이벤트는 NULL                     |
| 실행 계정 ID             | `actor_account_id` | uuid        | Y | N | -                   | 시스템 이벤트는 NULL                       |
| 실행 구성원 ID            | `actor_member_id`  | uuid        | Y | N | -                   |                                     |
| 행위 코드                | `action_code`      | varchar(50) | N | N | -                   | CREATE/READ/UPDATE/DELETE/CONSENT 등 |
| 대상 유형                | `target_type`      | varchar(50) | N | N | -                   |                                     |
| 대상 ID                | `target_id`        | uuid        | Y | N | -                   |                                     |
| 메타데이터                | `metadata_json`    | jsonb       | Y | N | -                   | 원문 개인정보 기록 금지                       |
| 발생 시각                | `occurred_at`      | timestamptz | N | N | `now()`             | 변경 불가 저장 권장                         |

### OBJ-34 돌봄 추천 (`care_recommendation`)

| 속성명물리명타입NULL식별자기본값비고 |                     |             |   |   |                     |                    |
| -------------------- | ------------------- | ----------- | - | - | ------------------- | ------------------ |
| 추천 ID                | `recommendation_id` | uuid        | N | Y | `gen_random_uuid()` |                    |
| 가족 그룹 ID             | `family_group_id`   | uuid        | N | N | -                   | 추천 대상 가족           |
| 자녀 ID                | `child_id`          | uuid        | Y | N | -                   | 특정 자녀 대상일 때        |
| 공백 예측 ID             | `prediction_id`     | uuid        | Y | N | -                   | 공백 대안 추천이면 연결      |
| 프로그램 ID              | `program_id`        | uuid        | N | N | -                   | 프로그램 또는 제도         |
| 추천 순위                | `rank_no`           | integer     | N | N | `1`                 | 동일 추천 건 내 순위       |
| 추천 근거                | `reason`            | text        | Y | N | -                   | 지역·기간·일정 적합성       |
| 선택 시각                | `selected_at`       | timestamptz | Y | N | -                   | 사용자가 선택하지 않으면 NULL |
| 생성 시각                | `created_at`        | timestamptz | N | N | `now()`             |                    |

## 4. 설계상 주요 관계

- `family_group`가 모든 가족 데이터의 테넌트 경계이며, `family_member`가 계정·자녀를 가족 그룹에 연결한다.
- `care_intake → care_item → care_assignment`가 Family Inbox에서 Role Match로 이어지는 핵심 데이터 흐름이다.
- `care_assignment → care_exception/care_alternative`가 충돌·긴급 요청에 대한 2차 조율 흐름이다.
- `care_assignment → care_handoff → handoff_location`이 인수인계와 동선 데이터 흐름이다.
- `care_assignment → care_completion → care_note/media_asset`가 완료·특이사항·사진 체크인 흐름이다.
- `notification`은 각 기능의 결과를 수신자별로 분리해 저장하며, `notification_preference`와 `appliance_integration`으로 채널을 결정한다.
- `subscription_plan → subscription → payment_transaction`은 Freemium 접근 제어와 결제 이력을 분리한다.
- 위치·아동정보·사진은 `consent_record`, `family_data_permission`, `audit_log`와 함께 사용해야 한다.

## 5. DBML

아래 코드는 [dbdiagram.io](https://dbdiagram.io/)에 그대로 붙여넣을 수 있는 PostgreSQL 기준 DBML이다. 운영 전에는 개인정보 암호화 방식, 파티셔닝, 외부 토큰 저장소, soft delete 정책을 별도로 확정해야 한다.

```dbml
Table account {
  account_id uuid [pk, not null, default: `gen_random_uuid()`]
  thinq_account_id varchar(100) [unique]
  email varchar(254)
  phone_number varchar(30)
  display_name varchar(100) [not null]
  status varchar(20) [not null, default: 'ACTIVE']
  last_login_at timestamptz
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}

Table family_group {
  family_group_id uuid [pk, not null, default: `gen_random_uuid()`]
  group_name varchar(100) [not null]
  owner_account_id uuid [not null]
  timezone varchar(50) [not null, default: 'Asia/Seoul']
  status varchar(20) [not null, default: 'ACTIVE']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}

Table child {
  child_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  name varchar(100) [not null]
  birth_date date
  care_profile_json jsonb
  status varchar(20) [not null, default: 'ACTIVE']
}

Table family_member {
  member_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  account_id uuid
  child_id uuid
  member_type varchar(20) [not null]
  default_role_code varchar(30)
  membership_status varchar(20) [not null, default: 'PENDING']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}

Table family_invitation {
  invitation_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  invited_by_account_id uuid [not null]
  invitee_email varchar(254)
  invitee_phone varchar(30)
  invite_token_hash varchar(255) [not null, unique]
  expires_at timestamptz [not null]
  status varchar(20) [not null, default: 'PENDING']
  accepted_account_id uuid
}

Table family_data_permission {
  permission_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  subject_member_id uuid [not null]
  child_id uuid
  scope_code varchar(30) [not null]
  is_allowed boolean [not null, default: false]
  expires_at timestamptz
}

Table subscription_plan {
  plan_id uuid [pk, not null, default: `gen_random_uuid()`]
  plan_code varchar(30) [not null, unique]
  plan_name varchar(100) [not null]
  max_adult_members int [not null, default: 3]
  max_children int [not null, default: 2]
  ocr_daily_limit int [not null, default: 2]
  ai_daily_token_limit int [not null, default: 10000]
  is_active boolean [not null, default: true]
}

Table subscription {
  subscription_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  plan_id uuid [not null]
  status varchar(20) [not null, default: 'ACTIVE']
  started_at timestamptz [not null, default: `now()`]
  ends_at timestamptz
  external_subscription_id varchar(150) [unique]
}

Table payment_transaction {
  payment_transaction_id uuid [pk, not null, default: `gen_random_uuid()`]
  subscription_id uuid [not null]
  external_transaction_id varchar(150) [not null, unique]
  amount numeric(12,2) [not null, default: 0]
  currency char(3) [not null, default: 'KRW']
  status varchar(20) [not null, default: 'PENDING']
  paid_at timestamptz
}

Table calendar_integration {
  calendar_integration_id uuid [pk, not null, default: `gen_random_uuid()`]
  account_id uuid [not null]
  provider_code varchar(30) [not null]
  external_calendar_id varchar(200) [not null]
  credential_ref varchar(255) [not null]
  sync_status varchar(20) [not null, default: 'PENDING']
  last_synced_at timestamptz
  last_error_message text
}

Table personal_schedule {
  personal_schedule_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  created_by_member_id uuid [not null]
  calendar_integration_id uuid
  external_event_id varchar(200)
  title varchar(200) [not null]
  starts_at timestamptz [not null]
  ends_at timestamptz [not null]
  input_type varchar(20) [not null, default: 'MANUAL']
  status varchar(20) [not null, default: 'ACTIVE']
}

Table media_asset {
  media_asset_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  uploaded_by_member_id uuid [not null]
  media_type varchar(20) [not null]
  storage_key varchar(500) [not null, unique]
  mime_type varchar(100) [not null]
  content_sha256 char(64) [not null]
  retention_expires_at timestamptz
  status varchar(20) [not null, default: 'ACTIVE']
}

Table care_intake {
  care_intake_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  submitted_by_member_id uuid [not null]
  input_type varchar(20) [not null]
  raw_content text
  source_media_id uuid
  processing_status varchar(20) [not null, default: 'RECEIVED']
  structured_result_json jsonb
  error_code varchar(50)
}

Table care_item {
  care_item_id uuid [pk, not null, default: `gen_random_uuid()`]
  care_intake_id uuid [not null]
  family_group_id uuid [not null]
  child_id uuid
  item_type varchar(30) [not null]
  title varchar(200) [not null]
  description text
  starts_at timestamptz
  ends_at timestamptz
  location_text varchar(255)
  status varchar(20) [not null, default: 'OPEN']
}

Table care_assignment {
  assignment_id uuid [pk, not null, default: `gen_random_uuid()`]
  care_item_id uuid [not null]
  assignee_member_id uuid [not null]
  assigned_by_member_id uuid
  assignment_source varchar(20) [not null, default: 'ROLE_MATCH']
  approval_status varchar(20) [not null, default: 'PENDING']
  status varchar(20) [not null, default: 'ASSIGNED']
  approved_at timestamptz
}

Table care_exception {
  exception_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  care_item_id uuid
  personal_schedule_id uuid
  requested_by_member_id uuid
  trigger_type varchar(30) [not null]
  description text
  status varchar(20) [not null, default: 'OPEN']
  detected_at timestamptz [not null, default: `now()`]
  resolved_at timestamptz
}

Table care_alternative {
  alternative_id uuid [pk, not null, default: `gen_random_uuid()`]
  exception_id uuid [not null]
  candidate_member_id uuid [not null]
  proposed_starts_at timestamptz
  proposed_ends_at timestamptz
  reason_json jsonb
  decision varchar(20) [not null, default: 'PENDING']
  decided_by_member_id uuid
  decided_at timestamptz
}

Table care_handoff {
  handoff_id uuid [pk, not null, default: `gen_random_uuid()`]
  care_item_id uuid [not null]
  from_assignment_id uuid
  to_assignment_id uuid [not null]
  context_summary text [not null]
  status varchar(20) [not null, default: 'PENDING']
  transferred_at timestamptz [not null, default: `now()`]
  confirmed_at timestamptz
}

Table handoff_location {
  handoff_location_id uuid [pk, not null, default: `gen_random_uuid()`]
  handoff_id uuid [not null]
  confirmed_by_member_id uuid [not null]
  latitude numeric(9,6) [not null]
  longitude numeric(9,6) [not null]
  accuracy_m numeric(8,2)
  consent_id uuid [not null]
  captured_at timestamptz [not null, default: `now()`]
  retention_expires_at timestamptz [not null]
}

Table care_completion {
  completion_id uuid [pk, not null, default: `gen_random_uuid()`]
  assignment_id uuid [not null, unique]
  completed_by_member_id uuid [not null]
  status varchar(20) [not null, default: 'COMPLETED']
  has_note boolean [not null, default: false]
  proof_media_id uuid
  completed_at timestamptz [not null, default: `now()`]
}

Table care_note {
  care_note_id uuid [pk, not null, default: `gen_random_uuid()`]
  completion_id uuid [not null]
  created_by_member_id uuid [not null]
  input_type varchar(20) [not null]
  content text [not null]
  source_media_id uuid
  created_at timestamptz [not null, default: `now()`]
}

Table notification {
  notification_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  recipient_member_id uuid [not null]
  event_type varchar(40) [not null]
  channel varchar(20) [not null, default: 'APP_PUSH']
  title varchar(200) [not null]
  body varchar(500) [not null]
  status varchar(20) [not null, default: 'PENDING']
  escalation_level int [not null, default: 0]
  scheduled_at timestamptz
  sent_at timestamptz
  target_type varchar(40)
  target_id uuid
  appliance_integration_id uuid
  retry_count int [not null, default: 0]
  last_error_code varchar(50)
}

Table notification_preference {
  notification_preference_id uuid [pk, not null, default: `gen_random_uuid()`]
  member_id uuid [not null, unique]
  app_push_enabled boolean [not null, default: true]
  appliance_enabled boolean [not null, default: false]
  escalation_enabled boolean [not null, default: true]
  updated_at timestamptz [not null, default: `now()`]
}

Table appliance_integration {
  appliance_integration_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  account_id uuid [not null]
  thinq_device_id varchar(150) [not null, unique]
  device_type varchar(30) [not null]
  online_status varchar(20) [not null, default: 'UNKNOWN']
  in_use boolean [not null, default: false]
  presence_checked_at timestamptz
  status varchar(20) [not null, default: 'ACTIVE']
}

Table feature_usage_daily {
  usage_id uuid [pk, not null, default: `gen_random_uuid()`]
  account_id uuid [not null]
  usage_date date [not null]
  feature_code varchar(30) [not null]
  usage_value bigint [not null, default: 0]
  limit_value bigint
  updated_at timestamptz [not null, default: `now()`]
  indexes { (account_id, usage_date, feature_code) [unique] }
}

Table ai_conversation {
  conversation_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  started_by_account_id uuid [not null]
  title varchar(200)
  status varchar(20) [not null, default: 'OPEN']
  started_at timestamptz [not null, default: `now()`]
  closed_at timestamptz
}

Table ai_message {
  message_id uuid [pk, not null, default: `gen_random_uuid()`]
  conversation_id uuid [not null]
  role varchar(20) [not null]
  content text [not null]
  input_tokens int [not null, default: 0]
  output_tokens int [not null, default: 0]
  action_json jsonb
  created_at timestamptz [not null, default: `now()`]
}

Table care_gap_prediction {
  prediction_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  child_id uuid
  source_schedule_id uuid
  gap_start_date date [not null]
  gap_end_date date
  dday int [not null]
  status varchar(20) [not null, default: 'PREDICTED']
}

Table care_program {
  program_id uuid [pk, not null, default: `gen_random_uuid()`]
  program_type varchar(30) [not null]
  name varchar(200) [not null]
  provider_name varchar(200)
  region_code varchar(20)
  detail_url varchar(500)
  valid_from date
  valid_to date
  source_updated_at timestamptz
}

Table family_album {
  album_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  child_id uuid
  album_name varchar(100) [not null]
  created_by_member_id uuid [not null]
  status varchar(20) [not null, default: 'ACTIVE']
}

Table album_media {
  album_media_id uuid [pk, not null, default: `gen_random_uuid()`]
  album_id uuid [not null]
  media_asset_id uuid [not null]
  caption varchar(500)
  published_at timestamptz [not null, default: `now()`]
}

Table consent_record {
  consent_id uuid [pk, not null, default: `gen_random_uuid()`]
  consented_by_member_id uuid [not null]
  family_group_id uuid [not null]
  child_id uuid
  consent_type varchar(40) [not null]
  policy_version varchar(30) [not null]
  is_granted boolean [not null, default: false]
  granted_at timestamptz
  revoked_at timestamptz
}

Table audit_log {
  audit_log_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid
  actor_account_id uuid
  actor_member_id uuid
  action_code varchar(50) [not null]
  target_type varchar(50) [not null]
  target_id uuid
  metadata_json jsonb
  occurred_at timestamptz [not null, default: `now()`]
}

Table care_recommendation {
  recommendation_id uuid [pk, not null, default: `gen_random_uuid()`]
  family_group_id uuid [not null]
  child_id uuid
  prediction_id uuid
  program_id uuid [not null]
  rank_no int [not null, default: 1]
  reason text
  selected_at timestamptz
  created_at timestamptz [not null, default: `now()`]
}

Ref: family_group.owner_account_id > account.account_id
Ref: child.family_group_id > family_group.family_group_id
Ref: family_member.family_group_id > family_group.family_group_id
Ref: family_member.account_id > account.account_id
Ref: family_member.child_id > child.child_id
Ref: family_invitation.family_group_id > family_group.family_group_id
Ref: family_invitation.invited_by_account_id > account.account_id
Ref: family_invitation.accepted_account_id > account.account_id
Ref: family_data_permission.family_group_id > family_group.family_group_id
Ref: family_data_permission.subject_member_id > family_member.member_id
Ref: family_data_permission.child_id > child.child_id
Ref: subscription.family_group_id > family_group.family_group_id
Ref: subscription.plan_id > subscription_plan.plan_id
Ref: payment_transaction.subscription_id > subscription.subscription_id
Ref: calendar_integration.account_id > account.account_id
Ref: personal_schedule.family_group_id > family_group.family_group_id
Ref: personal_schedule.created_by_member_id > family_member.member_id
Ref: personal_schedule.calendar_integration_id > calendar_integration.calendar_integration_id
Ref: media_asset.family_group_id > family_group.family_group_id
Ref: media_asset.uploaded_by_member_id > family_member.member_id
Ref: care_intake.family_group_id > family_group.family_group_id
Ref: care_intake.submitted_by_member_id > family_member.member_id
Ref: care_intake.source_media_id > media_asset.media_asset_id
Ref: care_item.care_intake_id > care_intake.care_intake_id
Ref: care_item.family_group_id > family_group.family_group_id
Ref: care_item.child_id > child.child_id
Ref: care_assignment.care_item_id > care_item.care_item_id
Ref: care_assignment.assignee_member_id > family_member.member_id
Ref: care_assignment.assigned_by_member_id > family_member.member_id
Ref: care_exception.family_group_id > family_group.family_group_id
Ref: care_exception.care_item_id > care_item.care_item_id
Ref: care_exception.personal_schedule_id > personal_schedule.personal_schedule_id
Ref: care_exception.requested_by_member_id > family_member.member_id
Ref: care_alternative.exception_id > care_exception.exception_id
Ref: care_alternative.candidate_member_id > family_member.member_id
Ref: care_alternative.decided_by_member_id > family_member.member_id
Ref: care_handoff.care_item_id > care_item.care_item_id
Ref: care_handoff.from_assignment_id > care_assignment.assignment_id
Ref: care_handoff.to_assignment_id > care_assignment.assignment_id
Ref: handoff_location.handoff_id > care_handoff.handoff_id
Ref: handoff_location.confirmed_by_member_id > family_member.member_id
Ref: handoff_location.consent_id > consent_record.consent_id
Ref: care_completion.assignment_id > care_assignment.assignment_id
Ref: care_completion.completed_by_member_id > family_member.member_id
Ref: care_completion.proof_media_id > media_asset.media_asset_id
Ref: care_note.completion_id > care_completion.completion_id
Ref: care_note.created_by_member_id > family_member.member_id
Ref: care_note.source_media_id > media_asset.media_asset_id
Ref: notification.family_group_id > family_group.family_group_id
Ref: notification.recipient_member_id > family_member.member_id
Ref: notification.appliance_integration_id > appliance_integration.appliance_integration_id
Ref: notification_preference.member_id > family_member.member_id
Ref: appliance_integration.family_group_id > family_group.family_group_id
Ref: appliance_integration.account_id > account.account_id
Ref: feature_usage_daily.account_id > account.account_id
Ref: ai_conversation.family_group_id > family_group.family_group_id
Ref: ai_conversation.started_by_account_id > account.account_id
Ref: ai_message.conversation_id > ai_conversation.conversation_id
Ref: care_gap_prediction.family_group_id > family_group.family_group_id
Ref: care_gap_prediction.child_id > child.child_id
Ref: family_album.family_group_id > family_group.family_group_id
Ref: family_album.child_id > child.child_id
Ref: family_album.created_by_member_id > family_member.member_id
Ref: album_media.album_id > family_album.album_id
Ref: album_media.media_asset_id > media_asset.media_asset_id
Ref: consent_record.consented_by_member_id > family_member.member_id
Ref: consent_record.family_group_id > family_group.family_group_id
Ref: consent_record.child_id > child.child_id
Ref: audit_log.family_group_id > family_group.family_group_id
Ref: audit_log.actor_account_id > account.account_id
Ref: audit_log.actor_member_id > family_member.member_id
Ref: care_recommendation.family_group_id > family_group.family_group_id
Ref: care_recommendation.child_id > child.child_id
Ref: care_recommendation.prediction_id > care_gap_prediction.prediction_id
Ref: care_recommendation.program_id > care_program.program_id
```


## 5-1. DBML 정합성 검증 결과

- 객체 목록 OBJ-01~OBJ-34와 DBML `Table` 34개가 일치하도록 보완했다.
- 객체별 속성 정의와 DBML 컬럼을 대조해 누락된 `handoff_location.consent_id`, `care_completion.proof_media_id`, `notification.appliance_integration_id`, `notification.retry_count`, `notification.last_error_code`를 반영했다.
- 자동 충돌 감지 시 요청자가 없을 수 있으므로 `care_exception.requested_by_member_id`는 NULL 가능하도록 수정했다.
- `care_recommendation` 테이블과 관련 FK를 추가했다.
- 추가 컬럼에 필요한 FK(`consent_record`, `media_asset`, `appliance_integration`)를 보완했다.
- 캘린더 제공자 예시는 Google·Microsoft·Apple·내장 캘린더를 모두 수용할 수 있도록 정리했다.
- DBML 끝에 남아 있던 불필요한 `svg` 문자열을 제거했다.
- 로컬 환경에 DBML CLI가 없어 실제 dbdiagram.io 렌더링 검증은 수행하지 못했으며, 대신 테이블 수·컬럼 일치·NULL 정의·참조 관계를 정적 검증했다.

## 6. 해석이 필요한 항목

1. 문서에는 외부 캘린더 제공자, 결제 사업자, ThinQ 기기 상세 스키마가 정의되어 있지 않으므로 `provider_code`, `external_*_id`, `credential_ref`를 연동 경계로 두었다.
2. AI·OCR·추천 결과의 내부 모델 구조는 요구사항 범위가 아니므로 원문 결과는 `jsonb`로 보관하고, 사용자에게 노출되는 구조화 결과만 정규화했다.
3. `family_member`는 보호자 계정과 자녀를 하나의 가족 참여 관계로 통합하기 위한 연결 객체다. 운영 단계에서 아동을 별도 사용자 계정으로 만들지 않는다는 전제를 둔다.
4. `notification.target_type/target_id`는 여러 기능 이벤트를 공통 처리하기 위한 보조 참조다. 강한 FK가 필요한 경우 이벤트별 상세 테이블 또는 Outbox 패턴으로 분리한다.
5. 위치정보·아동 건강정보·사진은 일반 텍스트 컬럼과 동일하게 취급하면 안 되며, 동의 검증·암호화·보관 만료 배치·접근 감사가 필수다.