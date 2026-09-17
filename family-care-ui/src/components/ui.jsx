import React from "react";

/** 화면 상단 헤더: 뒤로가기 / 닫기 + 제목 + 우측 액션 */
export function ScreenHeader({ onBack, onClose, title, right, className = "" }) {
  return (
    <div className={`flex items-center justify-between px-5 pt-2 pb-3 ${className}`}>
      <div className="flex w-9 items-center">
        {onBack && (
          <button onClick={onBack} aria-label="뒤로가기" className="p-1 -ml-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 5 8 12l7 7" stroke="#111114" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="닫기" className="p-1 -ml-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6 6 18" stroke="#111114" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {title && <h1 className="flex-1 truncate text-center text-[17px] font-semibold text-ink">{title}</h1>}
      <div className="flex w-9 justify-end">{right}</div>
    </div>
  );
}

/** primary(brand red) / secondary(outline) / ghost 버튼 */
export function Button({ children, variant = "primary", className = "", disabled, ...props }) {
  const base = "w-full rounded-2xl py-4 text-[16px] font-semibold transition active:scale-[0.98] disabled:opacity-40";
  const styles = {
    primary: "bg-primary text-white shadow-fab",
    secondary: "bg-white text-ink border border-line",
    ghost: "bg-transparent text-ink-soft",
    dark: "bg-white text-ink",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} disabled={disabled} {...props}>
      {children}
    </button>
  );
}

/** 그림자가 있는 흰색 카드 컨테이너 */
export function Card({ children, className = "", ...props }) {
  return (
    <div className={`rounded-2xl border border-line/70 bg-white p-4 shadow-card ${className}`} {...props}>
      {children}
    </div>
  );
}

/** 상태 뱃지 (확정 / 대기 / 충돌 등) */
export function Tag({ children, tone = "primary" }) {
  const tones = {
    primary: "text-primary bg-primary-light",
    neutral: "text-ink-soft bg-surfaceAlt",
    warning: "text-warning bg-warning/10",
    success: "text-success bg-success/10",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${tones[tone]}`}>{children}</span>
  );
}

/** iOS 스타일 토글 스위치 */
export function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-line"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/** 원형 라디오 선택 리스트 아이템 */
export function RadioRow({ selected, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
        selected ? "border-primary bg-primary-light/40" : "border-line bg-white"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-primary" : "border-line"
        }`}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </span>
      <span>
        <div className="text-[15px] font-medium text-ink">{title}</div>
        {subtitle && <div className="text-[12.5px] text-ink-soft">{subtitle}</div>}
      </span>
    </button>
  );
}

/** 화면 하단에서 올라오는 바텀시트 오버레이 */
export function BottomSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-full rounded-t-3xl bg-white p-6 shadow-sheet animate-[slideUp_.2s_ease-out]">
        {children}
      </div>
    </div>
  );
}

/** 원형 아바타 (이니셜 폴백) */
export function Avatar({ name, size = 40, tone = "bg-line" }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${tone} text-ink-soft font-semibold`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name?.[0]}
    </div>
  );
}
