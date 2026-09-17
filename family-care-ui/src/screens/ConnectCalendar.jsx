import React from "react";
import PhoneShell from "../components/PhoneShell.jsx";

/**
 * "업무 캘린더를 연결해주세요" — 온보딩 STEP 1/3, Outlook/Google 캘린더 연결 리스트
 * 원본: images/4f808612f9ea488107f208f8ded1b01cd1b07e56 (업무 캘린더를 연결해주세요)
 *
 * @param {() => void} onBack
 * @param {(provider: "outlook" | "google") => void} onConnect
 * @param {() => void} onSkip - "나중에 연결하기"
 */
export default function ConnectCalendar({ onBack, onConnect, onSkip }) {
  const providers = [
    {
      key: "outlook",
      initial: "O",
      tone: "bg-info",
      title: "Outlook 캘린더",
      subtitle: "회사 계정으로 로그인",
    },
    {
      key: "google",
      initial: "G",
      tone: "bg-primary",
      title: "Google 캘린더",
      subtitle: "개인 · 업무 계정 모두 가능",
    },
  ];

  return (
    <PhoneShell>
      <div className="flex min-h-full flex-col px-5 pb-6">
        <div className="flex items-center gap-3 pt-1">
          <button onClick={onBack} aria-label="뒤로가기" className="-ml-1 p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 5 8 12l7 7" stroke="#111114" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-light">
            <div className="h-full w-[33%] rounded-full bg-primary" />
          </div>
          <span className="text-[12px] font-medium text-ink-faint">1/3</span>
        </div>

        <div className="mt-5 text-[12px] font-bold tracking-widest text-primary">STEP 1</div>
        <h1 className="mt-1.5 text-[24px] font-bold leading-tight text-ink">
          업무 캘린더를
          <br />
          연결해주세요
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          아이 일정과 겹치는 시간대를 미리 찾기 위해 사용합니다.
          <br />
          회의 제목과 참석자는 가져오지 않습니다.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {providers.map((p) => (
            <button
              key={p.key}
              onClick={() => onConnect?.(p.key)}
              className="flex items-center gap-3.5 rounded-2xl border border-line bg-white p-4 text-left shadow-card"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white ${p.tone}`}
              >
                {p.initial}
              </span>
              <span className="flex-1">
                <div className="text-[15.5px] font-semibold text-ink">{p.title}</div>
                <div className="mt-0.5 text-[12.5px] text-ink-soft">{p.subtitle}</div>
              </span>
              <span className="text-ink-faint">›</span>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-info/15 p-4 text-[13px] leading-relaxed text-ink">
          연동은 부모 개인 계정에 걸립니다.
          <br />
          자녀가 여러 명이어도 한 번만 연결하면 됩니다.
        </div>

        <div className="flex-1" />

        <button
          onClick={onSkip}
          className="mx-auto mt-6 text-[14px] font-semibold text-ink"
        >
          나중에 연결하기
        </button>
      </div>
    </PhoneShell>
  );
}
