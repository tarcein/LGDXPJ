import React, { useState } from "react";
import PhoneShell from "../components/PhoneShell.jsx";

/**
 * "알림" — 나에게 온 것 / 전체 가족 탭, 오늘/어제로 그룹핑된 알림 리스트
 * 원본: images/3413c0a30a6407071d0d505f0f50e0037d2581b9 (알림)
 *
 * @param {(id: string) => void} onOpenItem - 알림 항목 탭 시 호출
 * @param {() => void} onMarkAllRead - "모두 읽음" 탭 시 호출
 */
export default function NotificationList({ onOpenItem, onMarkAllRead }) {
  const [tab, setTab] = useState("mine");

  const groups = [
    {
      label: "오늘",
      items: [
        {
          id: "confirm",
          dot: "bg-primary",
          title: "하윤 하원 시간 확인이 필요해요",
          subtitle: "승인 요청 · 14:47",
          unread: true,
        },
        {
          id: "done",
          dot: "bg-success",
          title: "할머니가 하원을 완료했어요",
          subtitle: "완료 보고 · 특이사항 1건 · 15:34",
        },
        {
          id: "info3",
          dot: "bg-line",
          title: "오늘 들어온 정보 3건",
          subtitle: "정보성 · 21:00",
        },
      ],
    },
    {
      label: "어제",
      items: [
        {
          id: "supplies",
          dot: "bg-line",
          title: "내일 준비물 ‘도화지’가 없어요",
          subtitle: "정보성 · 어제 21:00",
        },
      ],
    },
  ];

  return (
    <PhoneShell>
      <div className="flex min-h-full flex-col px-5 pb-5">
        <div className="flex items-center justify-between pt-1">
          <h1 className="text-[22px] font-bold text-ink">알림</h1>
          <button onClick={onMarkAllRead} className="text-[13.5px] font-semibold text-primary">
            모두 읽음
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setTab("mine")}
            className={`rounded-full px-4 py-2 text-[13.5px] font-semibold transition ${
              tab === "mine" ? "bg-primary text-white" : "border border-line bg-white text-ink-soft"
            }`}
          >
            나에게 온 것
          </button>
          <button
            onClick={() => setTab("family")}
            className={`rounded-full px-4 py-2 text-[13.5px] font-semibold transition ${
              tab === "family" ? "bg-primary text-white" : "border border-line bg-white text-ink-soft"
            }`}
          >
            전체 가족
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-2 text-[13px] font-medium text-ink-faint">{g.label}</div>
              <div className="flex flex-col gap-2.5">
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => onOpenItem?.(it.id)}
                    className="flex w-full items-start justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-card"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${it.dot}`} />
                      <div>
                        <div className="text-[14.5px] font-semibold text-ink">{it.title}</div>
                        <div className="mt-0.5 text-[12.5px] text-ink-soft">{it.subtitle}</div>
                      </div>
                    </div>
                    {it.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        <div className="mt-6 rounded-2xl bg-surfaceAlt px-4 py-3.5 text-center text-[12.5px] text-ink-soft">
          탭하면 해당 화면으로 바로 이동합니다.
        </div>
      </div>
    </PhoneShell>
  );
}
