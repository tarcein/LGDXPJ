import React from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { Button, Avatar } from "../components/ui.jsx";

/**
 * 가족 온보딩 — "누구에게 무엇까지" 구성원별 공개 범위(권한) 확인 화면
 * 원본: images/be7702727728699d1d61a120ffd9531743fe0376 (누구에게 무엇까지)
 */
export default function MemberAccess({ onBack, onOpenMember, onStart }) {
  const members = [
    { name: "지윤 (나)", subtitle: "주양육자 · 전체 공개", right: "변경 불가", locked: true },
    { name: "도현 (배우자)", subtitle: "전체 공개" },
    { name: "할머니", subtitle: "오늘 일정 + 준비물만 · 확인 필요", highlight: true },
    { name: "할아버지", subtitle: "오늘 일정 + 준비물만" },
  ];

  return (
    <PhoneShell time="2:26">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-5 pt-2 pb-4">
          <button type="button" onClick={onBack} aria-label="뒤로가기" className="p-1 -ml-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 5 8 12l7 7" stroke="#111114" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full w-[85%] rounded-full bg-primary" />
          </div>
          <span className="text-[12.5px] font-medium text-ink-faint">권한</span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <h1 className="mb-2 text-[22px] font-bold text-ink">누구에게 무엇까지</h1>
          <p className="mb-5 text-[13.5px] leading-relaxed text-ink-soft">
            초대가 끝났으니 공개 범위를 정해주세요. 정하지 않으면 아래 기본값이 적용됩니다.
          </p>

          <div className="flex flex-col gap-3">
            {members.map((m) => (
              <button
                key={m.name}
                type="button"
                onClick={() => !m.locked && onOpenMember?.(m.name)}
                className={`flex w-full items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left shadow-card ${
                  m.highlight ? "border-primary" : "border-line/70"
                }`}
              >
                <Avatar name={m.name} size={44} />
                <div className="flex-1">
                  <div className="text-[15px] font-semibold text-ink">{m.name}</div>
                  <div className={`text-[12.5px] ${m.highlight ? "font-medium text-primary" : "text-ink-soft"}`}>
                    {m.subtitle}
                  </div>
                </div>
                {m.locked ? (
                  <span className="text-[12.5px] text-ink-faint">{m.right}</span>
                ) : (
                  <span className="text-ink-faint">›</span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-surfaceAlt px-4 py-3.5">
            <div className="mb-1 text-[13px] font-semibold text-primary">기본값</div>
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              부모 · 배우자는 전체 공개, 조부모는 오늘 일정과 준비물만. 위치와 결제정보는 기본 꺼짐입니다.
            </p>
          </div>
        </div>

        <div className="px-5 pb-6 pt-2">
          <Button variant="primary" onClick={onStart}>
            이대로 시작하기
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}
