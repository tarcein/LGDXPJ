import React from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { Card, Tag, Avatar, Button } from "../components/ui.jsx";

/**
 * "배정 제안" 화면 — 등원 담당자 공백을 감지해 대체 인원(할머니)을 추천하고 요청을 보내는 화면
 * 원본: images/f8625891be921149246ec34dfb206955c70db77e (배정 제안)
 */
export default function AssignRequest({ onBack, onRequest, onFindOther, onDoItMyself }) {
  const reasons = [
    { rank: "1순위", text: "아빠 — 08:00 회의 (바쁨)", tone: "text-primary", emphasize: false },
    { rank: "2순위", text: "엄마 — 07:40 출근 이동 중", tone: "text-ink-soft", emphasize: false },
    { rank: "2순위", text: "할머니 — 가능", tone: "text-ink", emphasize: true },
  ];

  return (
    <PhoneShell time="21:04">
      <div className="flex flex-col gap-4 px-5 pb-6">
        <div className="flex items-center gap-1 pt-2">
          <button onClick={onBack} aria-label="뒤로가기" className="-ml-1 p-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 5 8 12l7 7" stroke="#111114" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-[18px] font-bold text-ink">배정 제안</h1>
        </div>

        <Card>
          <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-warning">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
            내일 (9/16 화) 08:00 등원
          </div>
          <p className="text-[16.5px] font-bold leading-snug text-ink">
            내일 아빠가 8시 회의라 등원이 어려워 보여요. 할머니가 그 시간 가능하실 것 같아요.
          </p>

          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surfaceAlt px-3.5 py-3">
            <Avatar name="할머니" />
            <div className="flex-1">
              <div className="text-[14.5px] font-semibold text-ink">할머니</div>
              <div className="mt-0.5 text-[12px] text-ink-soft">화요일 오전 일정 없음 · 최근 4회 등원</div>
            </div>
            <Tag tone="primary">1순위</Tag>
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            <Button variant="primary" onClick={onRequest}>
              할머니에게 요청
            </Button>
            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" onClick={onFindOther}>
                다른 사람 선택
              </Button>
              <Button variant="secondary" className="flex-1" onClick={onDoItMyself}>
                내가 직접 할게요
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-3 text-[15px] font-semibold text-ink">판단 근거</div>
          <div className="flex flex-col gap-2">
            {reasons.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[13.5px]">
                <span className={`w-11 shrink-0 font-semibold ${r.tone}`}>{r.rank}</span>
                <span className={r.emphasize ? "font-semibold text-ink" : "text-ink-soft"}>{r.text}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-ink-faint">캘린더는 바쁨/한가함만 참고했습니다 (Level A).</p>
        </Card>

        <div className="mt-auto rounded-2xl bg-surfaceAlt px-4 py-3.5">
          <p className="text-center text-[12.5px] leading-relaxed text-ink-soft">
            요청을 보내도 할머니가 수락하기 전까지 배정은 확정되지 않습니다.
          </p>
        </div>
      </div>
    </PhoneShell>
  );
}
