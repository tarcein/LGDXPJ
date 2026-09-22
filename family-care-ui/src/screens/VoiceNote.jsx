import React, { useState } from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { ScreenHeader, Button } from "../components/ui.jsx";

/**
 * "특이사항" — 음성으로 전달할 특이사항을 녹음/확인하는 화면
 * 원본: images/aefe7ed9ecb4157b0ea1a8f47a8d9802cf47abfa (특이사항 음성 녹음)
 */
export default function VoiceNote({ onBack, onSubmit }) {
  const [tab, setTab] = useState("voice"); // "voice" | "text"
  const [text, setText] = useState("");
  const transcript = "오늘 학교에서 조금 피곤해 보였고, 간식을 잘 안 먹었어요";

  return (
    <PhoneShell time="15:35">
      <div className="flex h-full flex-col">
        <ScreenHeader
          onBack={onBack}
          title="특이사항"
          right={
            <button type="button" onClick={onSubmit} className="text-[15px] font-semibold text-primary">
              전달
            </button>
          }
        />

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="mb-4 flex rounded-2xl bg-surfaceAlt p-1">
            <TabButton active={tab === "voice"} onClick={() => setTab("voice")}>
              음성
            </TabButton>
            <TabButton active={tab === "text"} onClick={() => setTab("text")}>
              직접 입력
            </TabButton>
          </div>

          {tab === "voice" ? (
            <div className="flex flex-col items-center rounded-2xl border border-line/70 bg-white px-5 py-6 shadow-card">
              <Waveform />
              <p className="mb-4 mt-2 text-[13.5px] font-semibold text-primary">듣고 있어요</p>

              <div className="mb-6 w-full rounded-xl bg-surfaceAlt px-4 py-3 text-[14.5px] leading-relaxed text-ink">
                {transcript}
              </div>

              <button
                type="button"
                aria-label="녹음"
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary shadow-fab"
              >
                <span className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/20 blur-xl" />
                <span className="flex items-end gap-1">
                  {[7, 14, 20, 14, 7].map((h, i) => (
                    <span key={i} className="w-[3px] rounded-full bg-white" style={{ height: h }} />
                  ))}
                </span>
              </button>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="특이사항을 입력해주세요"
              className="h-40 w-full rounded-2xl border border-line/70 bg-white p-4 text-[14.5px] text-ink shadow-card placeholder:text-ink-faint"
            />
          )}

          <button className="mt-4 flex w-full items-center justify-between rounded-2xl border border-line/70 bg-white px-4 py-3.5 shadow-card">
            <div className="text-left">
              <div className="text-[14.5px] font-semibold text-ink">사진 첨부 (선택)</div>
              <div className="text-[12.5px] text-ink-soft">모음ZIP에 자동 정리됩니다</div>
            </div>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surfaceAlt text-[15px] text-ink-soft">
              +
            </span>
          </button>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary-light/40 px-4 py-3 text-[13px] font-medium text-primary">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            다음 담당자 엄마(19:00)에게 전달돼요
          </div>
        </div>

        <div className="px-5 pb-6 pt-2">
          <Button variant="primary" onClick={onSubmit}>
            전달하고 완료
          </Button>
        </div>
      </div>
    </PhoneShell>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl py-2.5 text-[14px] font-semibold transition ${
        active ? "bg-white text-ink shadow-sm" : "text-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}

function Waveform() {
  const bars = [6, 14, 22, 14, 6];
  return (
    <div className="flex items-end gap-1">
      {bars.map((h, i) => (
        <span key={i} className="w-1 rounded-full bg-primary" style={{ height: h }} />
      ))}
    </div>
  );
}
