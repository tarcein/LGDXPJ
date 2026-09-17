import React, { useState } from "react";

// 프리뷰 하네스 전용 — 실제 컴포넌트 라이브러리의 일부가 아닙니다.
// src/screens/ 아래 모든 화면을 가져와 탭으로 전환하며 검토할 수 있게 해줍니다.
// 다른 에이전트들이 병렬로 화면을 추가하는 중이라, 이 파일을 다시 열었을 때
// screens/ 폴더에 여기 없는 화면이 더 있다면 같은 방식으로 import + SCREENS에 추가하면 됩니다.
import AssignRequest from "./screens/AssignRequest.jsx";
import CareNotifyCard from "./screens/CareNotifyCard.jsx";
import ConflictAlert from "./screens/ConflictAlert.jsx";
import ConnectCalendar from "./screens/ConnectCalendar.jsx";
import FamilyToday from "./screens/FamilyToday.jsx";
import GuardianLimitModal from "./screens/GuardianLimitModal.jsx";
import GuardianPermission from "./screens/GuardianPermission.jsx";
import HomeSelectModal from "./screens/HomeSelectModal.jsx";
import InviteCodeEntry from "./screens/InviteCodeEntry.jsx";
import InviteFamily from "./screens/InviteFamily.jsx";
import MemberAccess from "./screens/MemberAccess.jsx";
import NotificationList from "./screens/NotificationList.jsx";
import NotifyChannelSettings from "./screens/NotifyChannelSettings.jsx";
import PlanUpgrade from "./screens/PlanUpgrade.jsx";
import RoleSelect from "./screens/RoleSelect.jsx";
import ScheduleEdit from "./screens/ScheduleEdit.jsx";
import TimeConfirmModal from "./screens/TimeConfirmModal.jsx";
import TodoEmpty from "./screens/TodoEmpty.jsx";
import TodoList from "./screens/TodoList.jsx";
import VoiceNote from "./screens/VoiceNote.jsx";

const SCREENS = [
  { name: "FamilyToday", Component: FamilyToday },
  { name: "AssignRequest", Component: AssignRequest },
  { name: "CareNotifyCard", Component: CareNotifyCard },
  { name: "ConflictAlert", Component: ConflictAlert },
  { name: "ConnectCalendar", Component: ConnectCalendar },
  { name: "GuardianLimitModal", Component: GuardianLimitModal },
  { name: "GuardianPermission", Component: GuardianPermission },
  { name: "HomeSelectModal", Component: HomeSelectModal },
  { name: "InviteCodeEntry", Component: InviteCodeEntry },
  { name: "InviteFamily", Component: InviteFamily },
  { name: "MemberAccess", Component: MemberAccess },
  { name: "NotificationList", Component: NotificationList },
  { name: "NotifyChannelSettings", Component: NotifyChannelSettings },
  { name: "PlanUpgrade", Component: PlanUpgrade },
  { name: "RoleSelect", Component: RoleSelect },
  { name: "ScheduleEdit", Component: ScheduleEdit },
  { name: "TimeConfirmModal", Component: TimeConfirmModal },
  { name: "TodoEmpty", Component: TodoEmpty },
  { name: "TodoList", Component: TodoList },
  { name: "VoiceNote", Component: VoiceNote },
];

export default function App() {
  const [active, setActive] = useState("FamilyToday");
  const Active = SCREENS.find((s) => s.name === active)?.Component ?? FamilyToday;

  return (
    <div className="min-h-screen bg-bg">
      <div className="no-scrollbar sticky top-0 z-50 flex gap-2 overflow-x-auto border-b border-line bg-white px-4 py-3">
        {SCREENS.map(({ name }) => (
          <button
            key={name}
            onClick={() => setActive(name)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              active === name ? "bg-primary text-white" : "bg-surfaceAlt text-ink-soft"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="min-h-screen">
        <Active onNavigate={() => {}} />
      </div>
    </div>
  );
}
