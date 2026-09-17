import React from "react";

/**
 * iOS 스타일 상태 표시줄 (프리뷰 셸 전용).
 * 실제 앱에 통합할 때는 이 컴포넌트를 제거하고 OS 상태바를 그대로 사용하세요.
 */
export default function StatusBar({ time = "9:41", dark = false, battery = "88%" }) {
  const color = dark ? "text-white" : "text-ink";
  return (
    <div className={`flex items-center justify-between px-6 pt-3 pb-1 text-[15px] font-semibold ${color}`}>
      <span>{time}</span>
      <div className="flex items-center gap-1.5 text-[13px] font-medium">
        <span>▂▄▆</span>
        <span>LTE</span>
        <span className="opacity-70">{battery}</span>
      </div>
    </div>
  );
}
