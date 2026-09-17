import React from "react";

const TABS = [
  { key: "home", label: "홈", icon: HomeIcon },
  { key: "device", label: "디바이스", icon: DeviceIcon },
  { key: "care", label: "케어", icon: CareIcon },
  { key: "family", label: "가족", icon: FamilyIcon },
  { key: "menu", label: "메뉴", icon: MenuIcon },
];

/**
 * ThinQ 앱 기존 하단 탭 + 신규 "가족" 탭(뱃지 지원).
 * @param {string} active - 활성 탭 key
 * @param {number} familyBadge - "가족" 탭 우측 상단 뱃지 숫자 (0이면 숨김)
 * @param {(key:string)=>void} onChange
 */
export default function BottomNav({ active = "family", familyBadge = 0, onChange }) {
  return (
    <nav className="flex items-stretch justify-between border-t border-line bg-white px-2 pb-6 pt-2">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange?.(key)}
            className="relative flex flex-1 flex-col items-center gap-1 py-1"
          >
            <Icon active={isActive} />
            <span
              className={`text-[11px] ${isActive ? "font-semibold text-primary" : "text-ink-faint text-ink/40"}`}
            >
              {label}
            </span>
            {key === "family" && familyBadge > 0 && (
              <span className="absolute -top-0.5 right-[22%] flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                {familyBadge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function HomeIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-7.5Z"
        stroke={active ? "#C81F44" : "#B4B4BC"}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function DeviceIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke={active ? "#C81F44" : "#B4B4BC"} strokeWidth="1.8" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" stroke={active ? "#C81F44" : "#B4B4BC"} strokeWidth="1.8" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" stroke={active ? "#C81F44" : "#B4B4BC"} strokeWidth="1.8" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" stroke={active ? "#C81F44" : "#B4B4BC"} strokeWidth="1.8" />
    </svg>
  );
}
function CareIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9Z"
        stroke={active ? "#C81F44" : "#B4B4BC"}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function FamilyIcon({ active }) {
  const c = active ? "#C81F44" : "#B4B4BC";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="2.6" stroke={c} strokeWidth="1.8" />
      <circle cx="16" cy="9" r="2" stroke={c} strokeWidth="1.8" />
      <path d="M4 19c0-3 2.5-5 5-5s5 2 5 5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 19c.2-2.2 1.7-3.8 3.5-3.8s3.3 1.6 3.5 3.8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function MenuIcon({ active }) {
  const c = active ? "#C81F44" : "#B4B4BC";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="5.5" width="16" height="2.2" rx="1.1" fill={c} />
      <rect x="4" y="11" width="16" height="2.2" rx="1.1" fill={c} />
      <rect x="4" y="16.5" width="16" height="2.2" rx="1.1" fill={c} />
    </svg>
  );
}
