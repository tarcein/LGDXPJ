import React, { useState } from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { ScreenHeader, Button, Toggle } from "../components/ui.jsx";

/**
 * "일정 등록" — 일정 내용/날짜/시간 입력 및 가족 일정 충돌 확인 화면
 * 원본: images/1d65c4a351d8d64951ffcaa80050e42ce3affe6e (일정 등록 폼)
 */
export default function ScheduleEdit({ onClose, onSave }) {
  const [workCalendar, setWorkCalendar] = useState(true);

  return (
    <PhoneShell time="21:40">
      <div className="flex h-full flex-col">
        <ScreenHeader
          onClose={onClose}
          title="일정 등록"
          right={
            <button
              type="button"
              aria-label="음성으로 입력"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary shadow-fab"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M5 10v4M9 6v12M13 3v18M17 8v8M21 11v2" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          }
        />

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-line/70 bg-white p-4">
            <div>
              <div className="mb-1.5 text-[13px] text-ink-faint">내용</div>
              <div className="border-b-2 border-primary pb-2 text-[17px] font-bold text-ink">팀 워크숍</div>
            </div>

            <div>
              <div className="mb-1.5 text-[13px] text-ink-faint">날짜</div>
              <div className="flex items-center justify-between rounded-xl bg-surfaceAlt px-3.5 py-3">
                <span className="text-[16px] font-bold text-ink">2026.09.17 (목)</span>
                <span className="text-[16px]">📅</span>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <div className="mb-1.5 text-[13px] text-ink-faint">시작</div>
                <div className="rounded-xl bg-surfaceAlt px-3.5 py-3 text-[16px] font-bold text-ink">14:00</div>
              </div>
              <div className="flex-1">
                <div className="mb-1.5 text-[13px] text-ink-faint">종료</div>
                <div className="rounded-xl bg-surfaceAlt px-3.5 py-3 text-[16px] font-bold text-ink">17:30</div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-line/70 bg-white p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-4 w-4 shrink-0 rounded border-2 border-warning" />
              <span className="text-[14px] font-semibold text-warning">가족 일정과 충돌 확인 중</span>
            </div>
            <div className="text-[16px] font-bold text-ink">15:00 민솔 하원과 겹칩니다</div>
            <p className="mt-1 text-[13px] text-ink-soft">저장하면 대체 담당자를 바로 찾아드릴게요</p>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl border border-line/70 bg-white p-4">
            <div>
              <div className="text-[15px] font-semibold text-ink">업무 캘린더에도 반영</div>
              <div className="text-[12.5px] text-ink-faint">Outlook · 바쁨으로만 표시</div>
            </div>
            <Toggle checked={workCalendar} onChange={setWorkCalendar} />
          </div>
        </div>

        <div className="px-5 pb-6 pt-2">
          <Button variant="primary" onClick={onSave}>
            저장
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}
