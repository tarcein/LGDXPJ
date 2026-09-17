import React from "react";

/**
 * 보호자 인원 제한 안내 모달 — 다른 화면 위에 겹쳐서 렌더링하는 오버레이
 * 원본: images/26880d4f016e7f6dd18b64ac112aec0f753170c7 (무료 플랜은 보호자 3명까지예요)
 */
export default function GuardianLimitModal({ onClose, onUpgrade }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-ink/55" onClick={onClose} />

      <div className="relative w-full max-w-[340px] rounded-3xl bg-white p-6 shadow-sheet">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-warning/15">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="10" width="14" height="10" rx="2" stroke="#E0A63E" strokeWidth="1.8" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#E0A63E" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="mb-2 text-[19px] font-bold leading-snug text-ink">
          무료 플랜은
          <br />
          보호자 3명까지예요
        </h1>
        <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">
          지윤 · 도현 · 할머니가 이미 참여 중입니다. 할아버지를 추가하려면 Pro가 필요합니다.
        </p>

        <button
          onClick={onUpgrade}
          className="w-full rounded-2xl bg-primary py-4 text-[15px] font-semibold text-white shadow-fab transition active:scale-[0.98]"
        >
          Pro 알아보기
        </button>
        <button
          onClick={onClose}
          className="mt-3 w-full text-center text-[13.5px] font-medium text-ink-soft"
        >
          취소
        </button>
      </div>
    </div>
  );
}
