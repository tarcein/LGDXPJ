import React from "react";
import StatusBar from "./StatusBar.jsx";

/**
 * 목업의 공통 "둥근 화이트 카드" 셸. 배경은 연한 라벤더 그레이(bg),
 * 그 위에 상태바 + 콘텐츠 + (옵션) 하단 네비게이션이 올라간 흰색 카드가 떠 있는 구조입니다.
 *
 * 실제 앱에 통합할 때는 바깥 bg wrapper를 지우고 카드(rounded-3xl) 레이어만
 * 화면 루트로 사용하면 됩니다.
 */
export default function PhoneShell({
  children,
  dark = false,
  time = "9:41",
  battery,
  footer,
  noStatusBar = false,
  className = "",
}) {
  return (
    <div className="flex min-h-full w-full items-center justify-center bg-bg p-6">
      <div
        className={`phone-frame flex flex-col rounded-3xl shadow-2xl ${
          dark ? "bg-dark" : "bg-surface"
        } ${className}`}
      >
        {!noStatusBar && <StatusBar time={time} dark={dark} battery={battery} />}
        <div className="no-scrollbar flex-1 overflow-y-auto">{children}</div>
        {footer}
      </div>
    </div>
  );
}
