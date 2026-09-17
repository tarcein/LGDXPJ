import React from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import BottomNav from "../components/BottomNav.jsx";
import { Card, Tag, Avatar } from "../components/ui.jsx";

/**
 * "가족" 탭 홈 — 오늘의 배정 / 내일 미리 보기 / 아이별 오늘
 * 원본: images/611311e6d9762952453062911e525710f9c84d00 (가족 오늘 배정 목록)
 */
export default function FamilyToday({ onNavigate }) {
  const assignments = [
    { time: "07:00", title: "등원 — 아빠", note: "평소대로", status: "확정", highlight: false },
    {
      time: "15:00",
      title: "하원 — 할머니",
      note: "평소와 다름 · 사유: 아빠 회의",
      status: "확정",
      highlight: true,
    },
    { time: "19:00", title: "저녁 — 엄마", note: "평소대로", status: "확정", highlight: false },
  ];

  const kids = [
    { name: "민솔 (초2)", lines: ["태권도 15시", "준비물 없음"] },
    { name: "민준 (5세)", lines: ["유치원 하원 15시", "여분 옷 준비"] },
  ];

  return (
    <PhoneShell
      footer={<BottomNav active="family" familyBadge={3} onChange={onNavigate} />}
    >
      <div className="flex flex-col gap-4 px-5 pb-6">
        <div className="flex items-center justify-between pt-1">
          <div>
            <h1 className="text-[22px] font-bold text-ink">가족</h1>
            <p className="mt-0.5 text-[13px] text-ink-soft">9월 15일 (월) · 오늘 배정 3건</p>
          </div>
          <Avatar name="가" />
        </div>

        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <span className="text-[15px] font-semibold text-ink">오늘의 배정</span>
            <button className="text-[13px] font-medium text-primary">전체 보기 ›</button>
          </div>
          <div className="divide-y divide-line">
            {assignments.map((a) => (
              <div
                key={a.time}
                className={`flex items-start justify-between px-4 py-3 ${a.highlight ? "bg-warning/10" : ""}`}
              >
                <div className="flex gap-3">
                  <span className="w-11 shrink-0 text-[13px] font-medium text-ink-soft">{a.time}</span>
                  <div>
                    <div className="text-[14.5px] font-semibold text-ink">{a.title}</div>
                    <div
                      className={`text-[12.5px] ${a.highlight ? "font-medium text-warning" : "text-ink-soft"}`}
                    >
                      {a.note}
                    </div>
                  </div>
                </div>
                <Tag tone={a.highlight ? "warning" : "primary"}>{a.status}</Tag>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-2 text-[15px] font-semibold text-ink">내일 미리 보기</div>
          <div className="flex items-center gap-2 rounded-xl bg-surfaceAlt px-3 py-3 text-[13.5px] text-ink">
            <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
            <span className="flex-1">8시 등원 담당자 조정이 필요해요</span>
            <span className="text-ink-faint">›</span>
          </div>
        </Card>

        <div>
          <div className="mb-2 text-[15px] font-semibold text-ink">아이별 오늘</div>
          <div className="grid grid-cols-2 gap-3">
            {kids.map((k) => (
              <Card key={k.name} className="!p-3.5">
                <div className="mb-1.5 text-[13.5px] font-semibold text-ink">{k.name}</div>
                {k.lines.map((l) => (
                  <div key={l} className="text-[12px] leading-snug text-ink-soft">
                    {l}
                  </div>
                ))}
              </Card>
            ))}
          </div>
        </div>

        <p className="text-center text-[12px] text-ink-faint">평소와 같은 배정은 알리지 않습니다.</p>
      </div>
    </PhoneShell>
  );
}
