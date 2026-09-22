import React, { useState } from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { Button } from "../components/ui.jsx";

/**
 * "혹시 이미 가족이 이 서비스를 쓰고 있나요?" — 온보딩 2/4, 초대 코드 입력
 * 원본: images/535d24b0f877902f0b1afcf8badde6fb21ce1c95 (혹시 이미 가족이 이 서비스를 쓰고 있나요?)
 *
 * @param {() => void} onBack
 * @param {(code: string) => void} onJoin - "ZIPPY에 합류"
 * @param {() => void} onFirstTime - "아니요, 제가 처음이에요"
 */
export default function InviteCodeEntry({ onBack, onJoin, onFirstTime }) {
  const [code, setCode] = useState(["K", "7", "", "", "", ""]);

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
            <div className="h-full w-[45%] rounded-full bg-primary" />
          </div>
          <span className="text-[12px] font-medium text-ink-faint">2/4</span>
        </div>

        <h1 className="mt-5 text-[21px] font-bold leading-snug text-ink">
          혹시 이미 가족이
          <br />이 서비스를 쓰고 있나요?
        </h1>

        <div className="mt-5 rounded-2xl bg-white p-4 shadow-card">
          <div className="text-[12.5px] font-medium text-ink-soft">초대 코드 입력</div>
          <div className="mt-2.5 flex gap-2">
            {code.map((c, i) => (
              <div
                key={i}
                className={`flex h-11 flex-1 items-center justify-center rounded-xl border text-[16px] font-bold ${
                  i === 0
                    ? "border-2 border-primary text-ink"
                    : c
                    ? "border-line bg-surfaceAlt text-ink"
                    : "border-line text-ink-faint"
                }`}
              >
                {c || "–"}
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={() => onJoin?.(code.join(""))}>
            ZIPPY에 합류
          </Button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-line" />
          <span className="text-[12.5px] text-ink-faint">또는</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        <button
          onClick={onFirstTime}
          className="mt-5 w-full rounded-2xl bg-info/15 py-4 text-[15px] font-semibold text-ink"
        >
          아니요, 제가 처음이에요
        </button>

        <div className="mt-4 rounded-2xl bg-surfaceAlt p-4 text-[12.5px] leading-relaxed text-ink-soft">
          이 코드는 홈 코드와 별개입니다. 같은 집에 살아도 ZIPPY에는 참여하지 않을 수 있고,
          따로 사는 조부모도 참여할 수 있습니다.
        </div>
      </div>
    </PhoneShell>
  );
}
