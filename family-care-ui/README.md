# 가족 케어 (Family Care) UI — Figma → React 변환

첨부해주신 `목업이미지.fig`(DX 프로젝트 보드) 안에서 실제 UI 목업으로 그려진 화면 **20개**를
React(JSX) + Tailwind CSS 컴포넌트로 변환한 결과물입니다. LG ThinQ 앱의 "가족" 탭에 들어가는
Family Care 기능 화면들입니다.

## 실행해서 미리보기

```bash
npm install
npm run dev
```

브라우저에서 열리는 상단 탭 바에서 화면 20개를 하나씩 클릭하며 확인할 수 있습니다
(`src/App.jsx`는 미리보기 전용 하네스이며, 실제 프로젝트에 그대로 넣는 파일은 아닙니다).

## 구조

```
src/
  theme/            (tailwind.config.js에 정의된 색상 토큰 — Figma에서 실측한 값)
  components/
    PhoneShell.jsx  화면 공통 셸(둥근 흰 카드 + 상태바 + 하단 네비)
    BottomNav.jsx   홈/디바이스/케어/가족/메뉴 하단 탭 (가족 탭 뱃지 지원)
    StatusBar.jsx   프리뷰용 iOS 스타일 상태바 (실제 배포 시 OS 상태바로 대체)
    ui.jsx          공용 프리미티브: ScreenHeader, Button, Card, Tag, Toggle,
                     RadioRow, BottomSheet, Avatar
  screens/          화면 20개 (아래 목록 참고)
  App.jsx           프리뷰 하네스 (실제 라우팅에는 사용하지 마세요)
```

## 기존 프로젝트에 넣는 방법

이미 프론트엔드가 구현되어 있다고 하셨으니, 통째로 붙여넣기보다는 아래 순서를 추천합니다.

1. `tailwind.config.js`의 `theme.extend.colors` 토큰을 기존 프로젝트의 tailwind 설정에 병합하세요
   (이미 Tailwind를 쓰고 계시다면 색상 이름이 겹치지 않는지 확인해주세요).
2. `src/components/` 전체를 기존 프로젝트의 공용 컴포넌트 폴더로 복사하세요.
3. `src/screens/`의 화면들을 필요한 라우트에 하나씩 연결하세요. 각 화면은 순수 프레젠테이션
   컴포넌트라 **props로 데이터/콜백만 꽂아주면** 바로 백엔드 연동이 가능합니다
   (아래 "연동 시 참고" 참고).
4. `PhoneShell`은 프리뷰용 "폰 프레임"이 포함되어 있습니다. 실제 앱 화면 루트로 쓸 때는
   바깥 배경(`bg-bg` wrapper)을 제거하고 안쪽 흰 카드(`rounded-3xl` 컨테이너)만 화면 루트로
   사용하시면 자연스럽게 붙습니다.

## 화면 목록 (20개)

| 파일 | 설명 |
|---|---|
| `FamilyToday.jsx` | 가족 탭 홈 — 오늘의 배정 / 내일 미리 보기 / 아이별 오늘 |
| `CareNotifyCard.jsx` | 등원/하원 부탁 알림 카드 (수락/거절/전화) |
| `TodoEmpty.jsx` | 오늘 할 일 — 하원 완료 체크 바텀시트 |
| `TodoList.jsx` | 오늘 할 일 목록 + 이번 주 담당 통계 |
| `PlanUpgrade.jsx` | 무료 vs Pro 플랜 비교 + 결제 CTA |
| `ScheduleEdit.jsx` | 일정 등록 폼 (날짜/시간/캘린더 반영) |
| `GuardianLimitModal.jsx` | 무료 플랜 보호자 3명 제한 팝업 |
| `TimeConfirmModal.jsx` | 시간 확인 팝업 (추천 시간 선택) |
| `InviteFamily.jsx` | 가족 초대 온보딩 |
| `InviteCodeEntry.jsx` | 초대 코드 입력 |
| `NotificationList.jsx` | 알림 목록 (나에게 온 것 / 전체 가족) |
| `ConnectCalendar.jsx` | 업무 캘린더 연결 (Outlook/Google) |
| `HomeSelectModal.jsx` | 홈 선택 바텀시트 |
| `RoleSelect.jsx` | 가족 내 역할 선택 온보딩 |
| `GuardianPermission.jsx` | 보호자별 권한 설정 |
| `VoiceNote.jsx` | 특이사항 음성 녹음/전달 |
| `MemberAccess.jsx` | 구성원별 정보 공개 범위 설정 |
| `NotifyChannelSettings.jsx` | 알림 채널 설정 |
| `AssignRequest.jsx` | 대체 돌봄자 배정 제안 |
| `ConflictAlert.jsx` | 일정 겹침 알림 및 조정 |

## 제외한 항목 (참고)

원본 `.fig` 파일은 전체 DX 프로젝트 보드(문제 정의·리서치·페르소나 발표자료 포함)라
아래 항목은 "구현할 UI 화면"이 아니라고 판단해 변환에서 제외했습니다. 필요하시면 말씀해주세요.

- 플로우차트/로직 다이어그램 5개 (특이사항 처리 흐름, 역할 배정 로직, OCR 파싱 흐름 등)
- "정희원 홈" / "이지윤 홈" — 이건 신규 디자인이 아니라 **기존 LG ThinQ 앱 홈 화면**
  캡처본이라, Family Care 진입 지점 맥락으로만 쓰이고 이번 변환 대상에서는 뺐습니다.
- 장식용 그라디언트 배경 이미지 1개

## 연동 시 참고

- 모든 화면은 **더미 데이터가 하드코딩**되어 있습니다(백엔드가 이미 있다고 하셔서, 실제 데이터는
  각 화면 상단의 배열/객체를 props로 빼서 갈아끼우시면 됩니다).
- 토글/라디오/폼 입력 등 화면 내부 상호작용은 `useState`로 이미 동작합니다(프론트 단독으로도
  클릭·전환이 정상 작동).
- 팝업형 화면(`*Modal.jsx`)은 `PhoneShell`로 감싸지 않고 `onClose`/`onConfirm` 같은 콜백 props만
  받는 오버레이 컴포넌트입니다. 부모 화면 위에 `absolute inset-0`으로 얹어서 쓰시면 됩니다.
