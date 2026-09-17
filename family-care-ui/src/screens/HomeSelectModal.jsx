import React, { useState } from "react";
import { BottomSheet, RadioRow } from "../components/ui.jsx";

/**
 * "홈 선택" 바텀시트 — 스마트홈 화면 위에 뜨는 홈 선택 팝업 오버레이.
 * PhoneShell 없이, 부모 화면 위에 absolute inset-0으로 얹는 레이어로 사용합니다.
 * 원본: images/5a161cb167a222b0bbe3119eb0fa2ffee8fc9847 (홈 선택)
 */
export default function HomeSelectModal({ onClose, onSettings }) {
  const homes = ["이지윤 홈"];
  const [selected, setSelected] = useState("이지윤 홈");

  return (
    <BottomSheet open onClose={onClose}>
      <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-line" />

      <h1 className="mb-4 text-[20px] font-bold text-ink">홈 선택</h1>

      <div className="flex flex-col gap-2.5">
        {homes.map((h) => (
          <RadioRow key={h} title={h} selected={selected === h} onClick={() => setSelected(h)} />
        ))}
      </div>

      <button
        type="button"
        onClick={onSettings}
        className="mx-auto mt-6 flex items-center gap-1 pb-1 text-[15px] font-medium text-primary"
      >
        홈 설정 <span>›</span>
      </button>
    </BottomSheet>
  );
}
