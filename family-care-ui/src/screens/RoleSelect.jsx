import React, { useState } from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { Button, RadioRow } from "../components/ui.jsx";

/**
 * 가족 온보딩 1/4 — "이 가족에서 어떤 역할인가요?" 역할 선택 화면
 * 원본: images/6c6814d584bfc7cc80fbb578109e125c7da468dc (역할 선택)
 */
export default function RoleSelect({ onBack, onNext }) {
  const roles = [
    { key: "primary", title: "주양육자", subtitle: "전체 가족 캘린더 풀뷰" },
    { key: "secondary", title: "제2양육자", subtitle: "업무 캘린더 동기화 + 내 배정" },
    { key: "grandparent", title: "조부모 / 친척", subtitle: "오늘 내게 배정된 태스크 카드만" },
    { key: "sitter", title: "기타 돌봄자", subtitle: "시터 · 돌봄선생님" },
  ];
  const [selected, setSelected] = useState("primary");

  return (
    <PhoneShell time="2:18">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-5 pt-2 pb-4">
          <button type="button" onClick={onBack} aria-label="뒤로가기" className="p-1 -ml-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 5 8 12l7 7" stroke="#111114" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full w-[45%] rounded-full bg-primary" />
          </div>
          <span className="text-[12.5px] font-medium text-ink-faint">1/4</span>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          <h1 className="mb-2 text-[24px] font-bold leading-snug text-ink">
            이 가족에서
            <br />
            어떤 역할인가요?
          </h1>
          <p className="mb-6 text-[13.5px] leading-relaxed text-ink-soft">
            역할에 따라 보이는 정보의 범위가 자동으로 정해집니다. 나중에 바꿀 수 있습니다.
          </p>

          <div className="flex flex-col gap-3">
            {roles.map((r) => (
              <RadioRow
                key={r.key}
                title={r.title}
                subtitle={r.subtitle}
                selected={selected === r.key}
                onClick={() => setSelected(r.key)}
              />
            ))}
          </div>
        </div>

        <div className="px-5 pb-6 pt-4">
          <Button variant="primary" onClick={() => onNext?.(selected)}>
            다음
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}
