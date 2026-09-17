import React, { useState } from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import BottomNav from "../components/BottomNav.jsx";
import { Card, Tag } from "../components/ui.jsx";

/**
 * "오늘 할 일" 화면 — 조부모(할머니) 시점, 오늘 배정된 항목만 체크리스트로 노출
 * 원본: images/f420295688f0446e4062219e891fdd45ca6e5f9b (오늘 할 일)
 */
export default function TodoList({ onNavigate }) {
  const [tasks, setTasks] = useState([
    { id: "attend", title: "등원 — 민준", note: "08:02 완료 · 특이사항 없음", done: true, tag: null },
    { id: "pickup", title: "하원 — 민솔", note: "15:00 한빛초 정문", done: false, tag: "지금" },
  ]);

  const toggleTask = (id) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return (
    <PhoneShell time="15:10" battery="62%" footer={<BottomNav active="family" familyBadge={3} onChange={onNavigate} />}>
      <div className="flex flex-col gap-4 px-5 pb-6">
        <div className="pt-1">
          <h1 className="text-[22px] font-bold text-ink">오늘 할 일</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">할머니 · 9월 16일 (화) · 2건</p>
        </div>

        <Card className="!p-0 overflow-hidden">
          <div className="divide-y divide-line">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => toggleTask(t.id)}
                  aria-label={t.done ? "완료 취소" : "완료 처리"}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    t.done ? "border-primary bg-primary" : "border-line bg-white"
                  }`}
                >
                  {t.done && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13l5 5L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <div className="flex-1">
                  <div className={`text-[15px] font-semibold ${t.done ? "text-ink" : "text-ink"}`}>{t.title}</div>
                  <div className="mt-0.5 text-[12.5px] text-ink-soft">{t.note}</div>
                </div>
                {t.tag && <Tag tone="primary">{t.tag}</Tag>}
              </div>
            ))}
          </div>
        </Card>

        <div className="flex items-center gap-2 rounded-2xl border border-line/70 bg-white px-4 py-3 shadow-card">
          <span className="text-[15px] text-ink-faint">↔</span>
          <span className="text-[13px] text-ink-soft">항목을 옆으로 밀면 바로 완료 처리됩니다</span>
        </div>

        <div>
          <div className="mb-2 text-[15px] font-semibold text-ink">이번 주 내 담당</div>
          <Card>
            <div className="grid grid-cols-3 text-center">
              <div>
                <div className="text-[22px] font-bold text-ink">5</div>
                <div className="mt-0.5 text-[12px] text-ink-soft">맡은 일</div>
              </div>
              <div>
                <div className="text-[22px] font-bold text-success">4</div>
                <div className="mt-0.5 text-[12px] text-ink-soft">완료</div>
              </div>
              <div>
                <div className="text-[22px] font-bold text-warning">1</div>
                <div className="mt-0.5 text-[12px] text-warning">특이사항</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="rounded-2xl bg-surfaceAlt px-4 py-3.5">
          <p className="text-center text-[13px] text-ink-soft">조부모 역할은 오늘 배정된 일만 보입니다.</p>
        </div>
      </div>
    </PhoneShell>
  );
}
