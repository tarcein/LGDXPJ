import React, { useState } from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { ScreenHeader, Button, Toggle, Avatar } from "../components/ui.jsx";

/**
 * "할머니 권한" — 가족 구성원별 공개 범위 / 권한 설정 화면
 * 원본: images/a5b03d1b38da1af02a1a41826dcaae203daf0bfc (할머니 권한)
 */
export default function GuardianPermission({ onBack, onSave }) {
  const [scheduleScope, setScheduleScope] = useState("today"); // "today" | "all"
  const [supplies, setSupplies] = useState(true);
  const [childDetail, setChildDetail] = useState(true);
  const [liveLocation, setLiveLocation] = useState(false);
  const [payment, setPayment] = useState(false);

  return (
    <PhoneShell time="2:27">
      <div className="flex h-full flex-col">
        <ScreenHeader onBack={onBack} title="할머니 권한" />

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line/70 bg-white p-4 shadow-card">
            <Avatar name="할머니" size={48} />
            <div>
              <div className="text-[16px] font-bold text-ink">할머니</div>
              <div className="text-[13px] text-ink-soft">조부모 · 9월 15일 합류</div>
            </div>
          </div>

          <div className="divide-y divide-line rounded-2xl border border-line/70 bg-white shadow-card">
            <Row title="일정 공개 범위" subtitle="오늘 것만 / 일정 전체">
              <div className="flex rounded-full bg-surfaceAlt p-0.5">
                <SegButton active={scheduleScope === "today"} onClick={() => setScheduleScope("today")}>
                  오늘
                </SegButton>
                <SegButton active={scheduleScope === "all"} onClick={() => setScheduleScope("all")}>
                  전체
                </SegButton>
              </div>
            </Row>
            <Row title="준비물 · 할일" subtitle="배정된 일에 딸린 준비물">
              <Toggle checked={supplies} onChange={setSupplies} />
            </Row>
            <Row title="자녀 상세정보" subtitle="알레르기 · 병력 · 복약">
              <Toggle checked={childDetail} onChange={setChildDetail} />
            </Row>
            <Row title="실시간 위치" subtitle="기본 꺼짐 · 도착 알림만">
              <Toggle checked={liveLocation} onChange={setLiveLocation} />
            </Row>
            <Row title="결제 · 학원비 정보" subtitle="기본 꺼짐">
              <Toggle checked={payment} onChange={setPayment} />
            </Row>
          </div>

          <div className="mt-4 rounded-2xl bg-surfaceAlt px-4 py-3.5 text-[12.5px] leading-relaxed text-ink-soft">
            알레르기 · 복약 정보는 돌봄에 필요해 기본 켜짐입니다. 위치와 결제정보는 요청이 있을 때만 켜세요.
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

function Row({ title, subtitle, children }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div>
        <div className="text-[14.5px] font-semibold text-ink">{title}</div>
        <div className="text-[12.5px] text-ink-soft">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function SegButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
        active ? "bg-white text-ink shadow-sm" : "text-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}
