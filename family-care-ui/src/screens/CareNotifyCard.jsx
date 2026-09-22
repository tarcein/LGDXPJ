import React from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { Button } from "../components/ui.jsx";

/**
 * 다크 배경 알림 카드 — 며느리의 등원 요청을 수락/거절하는 화면
 * 원본: images/0152b0044de98fefa71c81b6a38b4329e371746f (ZIPPY 알림 카드)
 */
export default function CareNotifyCard({ onAccept, onDecline, onCall }) {
  const details = [
    { label: "날짜", value: "9월 16일 (화)" },
    { label: "시간", value: "오전 8:00" },
    { label: "장소", value: "별빛유치원" },
  ];

  return (
    <PhoneShell dark time="21:05">
      <div className="flex flex-col gap-5 px-5 pb-6">
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-7.5Z"
                  fill="white"
                />
              </svg>
            </div>
            <span className="text-[16px] font-semibold text-white">ZIPPY</span>
          </div>
          <span className="text-[13px] text-white/50">방금</span>
        </div>

        <div className="rounded-3xl bg-white p-5">
          <div className="mb-2 text-[13px] font-semibold text-primary">며느리 지윤님의 요청</div>
          <h1 className="text-[22px] font-bold leading-snug text-ink">
            내일 오전 8시
            <br />
            민준이 등원
            <br />
            부탁드려요
          </h1>

          <div className="mt-4 flex flex-col gap-2.5 rounded-2xl bg-surfaceAlt px-4 py-3.5">
            {details.map((d) => (
              <div key={d.label} className="flex items-center text-[14px]">
                <span className="w-12 shrink-0 text-ink-soft">{d.label}</span>
                <span className="font-semibold text-ink">{d.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-2.5">
            <Button variant="primary" onClick={onAccept}>
              수락할게요
            </Button>
            <div className="flex gap-2.5">
              <button
                onClick={onDecline}
                className="flex-1 rounded-2xl border border-line bg-bg py-3.5 text-[15px] font-semibold text-ink transition active:scale-[0.98]"
              >
                어려워요
              </button>
              <button
                onClick={onCall}
                className="flex-1 rounded-2xl border border-line bg-bg py-3.5 text-[15px] font-semibold text-ink transition active:scale-[0.98]"
              >
                전화하기
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-surfaceAlt/90 px-4 py-3.5">
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            &lsquo;어려워요&rsquo;를 누르면 다른 가능한 분을 다시 찾아 지윤님께 알려드립니다.
          </p>
        </div>
      </div>
    </PhoneShell>
  );
}
