import React, { useState } from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { Button, RadioRow } from "../components/ui.jsx";

/**
 * "일정이 겹칩니다" 화면 — 수동입력 일정과 OCR로 인식된 알림장 일정이 충돌할 때 무엇이 맞는지 고르는 화면
 * 원본: images/f98558a8f8aa0038a00880d67a0cfe9d50ae481b (일정이 겹칩니다)
 */
export default function ConflictAlert({ onBack, onLater, onConfirm }) {
  const [selected, setSelected] = useState(null);

  return (
    <PhoneShell time="2:25">
      <div className="flex h-full flex-col gap-4 px-5 pb-6">
        <div className="flex items-center gap-1 pt-2">
          <button onClick={onBack} aria-label="뒤로가기" className="-ml-1 p-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 5 8 12l7 7" stroke="#111114" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-[18px] font-bold text-ink">일정이 겹칩니다</h1>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-warning/15 px-3.5 py-3">
          <span className="text-[15px]">⚠️</span>
          <span className="text-[13.5px] font-medium text-ink">지우 · 9월 11일 15:00 · 두 정보가 서로 다릅니다</span>
        </div>

        <p className="text-[15px] leading-relaxed text-ink">
          기존에 &lsquo;태권도 15시&rsquo;가 있는데, 이 알림장에는 &lsquo;방과후 미술 15시&rsquo;로 되어 있어요. 어느 게
          맞나요?
        </p>

        <div className="flex flex-col gap-2.5">
          <RadioRow
            selected={selected === "taekwondo"}
            onClick={() => setSelected("taekwondo")}
            title="태권도 15:00"
            subtitle={
              <>
                출처 수동입력 · 8월 28일 등록
                <br />
                반복 일정 (매주 화)
              </>
            }
          />
          <RadioRow
            selected={selected === "art"}
            onClick={() => setSelected("art")}
            title="방과후 미술 15:00"
            subtitle={
              <>
                출처 OCR · 오늘 알림장
                <br />
                신뢰도 높음
              </>
            }
          />
          <button
            type="button"
            onClick={() => setSelected("both")}
            className={`flex w-full items-center gap-3 rounded-2xl border border-dashed px-4 py-3.5 text-left transition ${
              selected === "both" ? "border-primary bg-primary-light/40" : "border-line bg-white"
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                selected === "both" ? "border-primary" : "border-line"
              }`}
            >
              {selected === "both" && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
            </span>
            <span className="text-[15px] font-medium text-ink">둘 다 맞아요 (연달아 있음)</span>
          </button>
        </div>

        <div className="rounded-2xl bg-info/10 px-4 py-3.5">
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            조부모가 다른 안내를 받았거나 학원 변경 공지가 늦게 올라오는 경우가 많아, 선택 전까지 기존 일정을 지우지
            않습니다.
          </p>
        </div>

        <div className="mt-auto flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={onLater}>
            나중에
          </Button>
          <Button variant="primary" className="flex-[2]" disabled={!selected} onClick={() => onConfirm?.(selected)}>
            선택 완료
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}
