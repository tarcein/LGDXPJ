import React, { useState } from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { Toggle, Tag, Button } from "../components/ui.jsx";

/**
 * "알림 채널" 설정 화면 — 앱 알림(끌 수 없음) / 가전 알림(Pro 전용, 잠김 + 안내 팝업)
 * 원본: images/effb1b5c6da7eb6c56b658eb7485274c19b7b248 (알림 채널)
 */
export default function NotifyChannelSettings({ onBack, onLearnMorePro }) {
  const [showProPrompt, setShowProPrompt] = useState(true);

  // 두 번째 행("정수기 …")은 원본 이미지에서 Pro 안내 팝업에 가려져 일부 텍스트만 보입니다.
  // 보이는 글자("정수기", "주방 · 청…")를 바탕으로 자연스러운 문구로 복원했습니다.
  const applianceRows = [
    { title: "TV 화면 알림", subtitle: "거실 TV · 시각 알림" },
    { title: "정수기 잔량 알림", subtitle: "주방 · 청정 알림" },
    { title: "로봇청소기 음성", subtitle: "거실 · 청각 알림" },
  ];

  return (
    <PhoneShell time="21:50">
      <div className="flex h-full flex-col gap-5 px-5 pb-6">
        <div className="flex items-center gap-1 pt-2">
          <button onClick={onBack} aria-label="뒤로가기" className="-ml-1 p-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 5 8 12l7 7" stroke="#111114" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-[18px] font-bold text-ink">알림 채널</h1>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="text-[13px] font-medium text-ink-soft">앱 알림</div>
          <div className="rounded-2xl border border-line/70 bg-white px-4 py-3.5 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[15px] font-semibold text-ink">푸시 알림</div>
                <div className="mt-0.5 text-[12.5px] text-ink-faint">항상 켜짐 · 끌 수 없음</div>
              </div>
              <Toggle checked disabled />
            </div>
          </div>
        </div>

        <div className="relative flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-soft">
            가전 알림
            <Tag tone="warning">PRO</Tag>
          </div>

          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line/70 bg-white shadow-card">
            {applianceRows.map((row) => (
              <div key={row.title} className="flex items-center gap-3 px-4 py-3.5">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-surfaceAlt" />
                <div className="flex-1">
                  <div className="text-[15px] font-semibold text-ink-faint">{row.title}</div>
                  <div className="mt-0.5 text-[12.5px] text-ink-faint">{row.subtitle}</div>
                </div>
                <Toggle checked={false} disabled />
              </div>
            ))}
          </div>

          {showProPrompt && (
            <div className="absolute inset-x-6 top-[92px] z-10 flex flex-col items-center gap-2.5 rounded-2xl bg-white px-6 py-6 text-center shadow-sheet">
              <span className="text-[22px] leading-none">🔒</span>
              <p className="text-[16px] font-bold text-ink">Pro에서 사용 가능</p>
              <Button
                variant="primary"
                className="!w-auto rounded-xl px-6 !py-2.5 text-[14px]"
                onClick={onLearnMorePro ?? (() => setShowProPrompt(false))}
              >
                Pro 알아보기
              </Button>
            </div>
          )}
        </div>

        <div className="mt-auto rounded-2xl bg-surfaceAlt px-4 py-3.5">
          <p className="text-center text-[13px] text-ink-soft">폰을 못 보는 순간에도 집 안 기기로 알려줍니다.</p>
        </div>
      </div>
    </PhoneShell>
  );
}
