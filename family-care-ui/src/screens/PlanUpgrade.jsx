import React from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { ScreenHeader, Button } from "../components/ui.jsx";

/**
 * "플랜" — 무료 vs Pro 기능 비교 및 업그레이드 화면
 * 원본: images/179538f44d32f09e50080ff1c4825ed2a7c4e4b0 (Pro로 할 수 있는 것)
 */
export default function PlanUpgrade({ onClose, onUpgrade }) {
  const rows = [
    { label: "알림장 인식", free: "check", pro: "check" },
    { label: "보호자 인원", free: "3명", pro: "무제한" },
    { label: "AI 대화", free: "15회", pro: "무제한" },
    { label: "음성 등록", free: "—", pro: "check" },
    { label: "긴급 도움 요청", free: "—", pro: "check" },
    { label: "가전 알림", free: "—", pro: "check" },
    { label: "부가서비스 3종", free: "—", pro: "check" },
  ];

  return (
    <PhoneShell time="21:58">
      <div className="flex h-full flex-col">
        <ScreenHeader onClose={onClose} title="플랜" />

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <h1 className="mb-1.5 text-[24px] font-bold text-ink">Pro로 할 수 있는 것</h1>
          <p className="mb-4 text-[13.5px] text-ink-faint">언제든 해지할 수 있습니다</p>

          <div className="overflow-hidden rounded-2xl border border-line/70">
            <div className="grid grid-cols-[1fr_64px_64px] bg-bg px-4 py-3">
              <span className="text-[13.5px] font-semibold text-ink-soft">기능</span>
              <span className="text-center text-[13.5px] font-semibold text-ink-soft">무료</span>
              <span className="text-center text-[13.5px] font-bold text-primary">Pro</span>
            </div>
            <div className="divide-y divide-line bg-white">
              {rows.map((r) => (
                <div key={r.label} className="grid grid-cols-[1fr_64px_64px] items-center px-4 py-3.5">
                  <span className="text-[14.5px] font-medium text-ink">{r.label}</span>
                  <Cell value={r.free} tone="free" />
                  <Cell value={r.pro} tone="pro" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 pb-6 pt-2">
          <p className="mb-3 text-center text-[26px] font-bold text-ink">
            9,900<span className="text-[18px]">원</span>
            <span className="text-[14px] font-medium text-ink-faint">/월</span>
          </p>
          <Button variant="primary" onClick={onUpgrade}>
            Pro 시작하기
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}

function Cell({ value, tone }) {
  if (value === "check") {
    return (
      <span
        className={`text-center text-[16px] font-bold ${tone === "pro" ? "text-primary" : "text-success"}`}
      >
        ✓
      </span>
    );
  }
  if (value === "—") {
    return <span className="text-center text-[14px] text-ink-faint">—</span>;
  }
  return (
    <span
      className={`text-center text-[13.5px] font-bold ${tone === "pro" ? "text-primary" : "text-ink-faint"}`}
    >
      {value}
    </span>
  );
}
