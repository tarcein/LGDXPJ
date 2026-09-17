import React, { useState } from "react";
import PhoneShell from "../components/PhoneShell.jsx";

/**
 * "오늘 할 일" — 빈 할 일 목록 위로 완료 확인 바텀시트가 떠 있는 화면
 * 원본: images/048818097e2b214ec9f28b99e8defaa6537728c5 (오늘 할 일 + 하원 완료 확인 시트)
 */
export default function TodoEmpty({ onSubmit }) {
  const [sheetOpen, setSheetOpen] = useState(true);

  const handleChoice = (hasNote) => {
    setSheetOpen(false);
    onSubmit?.(hasNote);
  };

  return (
    <PhoneShell time="15:34">
      <div className="relative flex h-full flex-col">
        <div className="flex flex-col gap-4 px-5 pb-6 pt-1">
          <h1 className="text-[22px] font-bold text-ink">오늘 할 일</h1>
          <div className="h-[145px] rounded-2xl bg-surfaceAlt/70" />
          <div className="h-[95px] rounded-2xl bg-surfaceAlt/70" />
        </div>

        {sheetOpen && (
          <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl bg-white px-6 pb-6 pt-3 shadow-sheet">
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line" />

            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="text-[15px] font-semibold text-ink">하원 완료</div>
                <div className="text-[12px] text-ink-faint">민솔 · 15:34</div>
              </div>
            </div>

            <h2 className="mb-1.5 text-[18px] font-bold text-ink">특이사항이 있었나요?</h2>
            <p className="mb-5 text-[13px] leading-relaxed text-ink-soft">
              없으면 그냥 닫히고, 있으면 다음 담당자에게 전달됩니다.
            </p>

            <div className="flex gap-2.5">
              <button
                onClick={() => handleChoice(false)}
                className="flex-1 rounded-2xl bg-surfaceAlt py-4 text-[15px] font-semibold text-ink transition active:scale-[0.98]"
              >
                없음
              </button>
              <button
                onClick={() => handleChoice(true)}
                className="flex-1 rounded-2xl bg-primary py-4 text-[15px] font-semibold text-white shadow-fab transition active:scale-[0.98]"
              >
                있음
              </button>
            </div>
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
