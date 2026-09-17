import React, { useState } from "react";
import { RadioRow, Button } from "../components/ui.jsx";

/**
 * "시간이 맞나요?" — 손글씨 인식 결과 시간 재확인 팝업 (다크 스크림 위에 뜨는 바텀시트)
 * 원본: images/26da035927ef489f238f3036ebdd1406f7f1a864 (시간이 맞나요?)
 *
 * PhoneShell로 감싸지 않고, 부모 화면(스캔/추출 결과 확인 화면) 위에 레이어로 얹는
 * absolute inset-0 오버레이입니다.
 *
 * @param {(value: string) => void} onConfirm - "이 시간으로 확정" 클릭 시 선택된 시간과 함께 호출
 * @param {() => void} onClose - 배경(스크림) 클릭 시 호출
 */
export default function TimeConfirmModal({ onConfirm, onClose }) {
  const [selected, setSelected] = useState("8:20am");

  const options = [
    { key: "8:20am", title: "오전 8:20", subtitle: "등교 시간대" },
    { key: "6:20pm", title: "오후 6:20" },
    { key: "custom", title: "직접 입력" },
  ];

  return (
    <div className="absolute inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full rounded-t-3xl bg-white pb-6 pt-3 shadow-sheet animate-[slideUp_.2s_ease-out]">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line" />

        <div className="px-6">
          <h2 className="text-[19px] font-bold text-ink">시간이 맞나요?</h2>
          <p className="mt-1.5 text-[13px] leading-snug text-ink-soft">
            원본에 “8:20”으로 보이지만 손글씨라 확신이 낮습니다.
          </p>

          <button
            type="button"
            className="mx-auto my-4 block text-[12.5px] text-ink-faint underline underline-offset-2"
          >
            원본 해당 영역 확대
          </button>

          <div className="flex flex-col gap-2.5">
            {options.map((o) => (
              <RadioRow
                key={o.key}
                selected={selected === o.key}
                title={o.title}
                subtitle={o.subtitle}
                onClick={() => setSelected(o.key)}
              />
            ))}
          </div>

          <Button className="mt-5" onClick={() => onConfirm?.(selected)}>
            이 시간으로 확정
          </Button>
        </div>
      </div>
    </div>
  );
}
