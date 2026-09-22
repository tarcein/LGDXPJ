import React from "react";
import PhoneShell from "../components/PhoneShell.jsx";
import { Button, Avatar } from "../components/ui.jsx";

/**
 * "함께 챙길 가족을 초대해보세요" — 온보딩 마지막 단계(4/4), 기존 홈 멤버 추천 카드 +
 * 새로 초대하기 리스트
 * 원본: images/28040cdfad11ef2dc519462dcb3732a8adcec0df (함께 챙길 가족을 초대해보세요)
 *
 * @param {() => void} onBack
 * @param {() => void} onSkip - "나중에 할게요"
 * @param {() => void} onAddAsCoParent - "제2양육자로 추가"
 * @param {() => void} onChangeRole - "역할 변경"
 */
export default function InviteFamily({ onBack, onSkip, onAddAsCoParent, onChangeRole }) {
  return (
    <PhoneShell>
      <div className="flex min-h-full flex-col px-5 pb-6">
        <div className="flex items-center gap-3 pt-1">
          <button onClick={onBack} aria-label="뒤로가기" className="-ml-1 p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 5 8 12l7 7" stroke="#111114" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-light">
            <div className="h-full w-[92%] rounded-full bg-primary" />
          </div>
          <span className="text-[12px] font-medium text-ink-faint">4/4</span>
        </div>

        <h1 className="mt-5 text-[21px] font-bold leading-snug text-ink">
          함께 챙길 가족을 초대해보세요
        </h1>

        <div className="mt-5 rounded-2xl border-2 border-primary bg-white p-4">
          <div className="text-[12.5px] font-bold text-primary">이미 홈 멤버에요</div>
          <div className="mt-2.5 flex items-center gap-3">
            <Avatar name="김" tone="bg-line" />
            <div>
              <div className="text-[15px] font-semibold text-ink">
                김도현님을 ZIPPY에도 추가할까요?
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink-soft">
                연결된 계정 그대로 · 재입력 없음
              </div>
            </div>
          </div>
          <div className="mt-3.5 flex gap-2.5">
            <button
              onClick={onAddAsCoParent}
              className="flex-1 rounded-xl bg-primary py-3 text-[14px] font-semibold text-white"
            >
              제2양육자로 추가
            </button>
            <button
              onClick={onChangeRole}
              className="flex-1 rounded-xl border border-line bg-white py-3 text-[14px] font-semibold text-ink"
            >
              역할 변경
            </button>
          </div>
        </div>

        <div className="mt-6 text-[15px] font-semibold text-ink">새로 초대하기</div>

        <div className="mt-2.5 flex flex-col gap-2.5">
          <button className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-primary-light" />
            <span>
              <div className="text-[14.5px] font-semibold text-ink">+ 조부모 초대</div>
              <div className="text-[12px] text-ink-soft">전화번호로 초대 · 오늘 배정된 태스크만 보여요</div>
            </span>
          </button>
          <button className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-primary-light" />
            <span>
              <div className="text-[14.5px] font-semibold text-ink">+ 시터 / 돌봄선생님 초대</div>
              <div className="text-[12px] text-ink-soft">전화번호 또는 QR</div>
            </span>
          </button>
        </div>

        <div className="mt-3 rounded-2xl bg-surfaceAlt p-4">
          <div className="text-[13px] font-bold text-warning">권한은 분리됩니다</div>
          <div className="mt-1 text-[12.5px] leading-snug text-ink-soft">
            ZIPPY에 초대해도 가전 제어 권한은 따라가지 않습니다.
          </div>
        </div>

        <div className="flex-1" />

        <Button
          variant="secondary"
          className="mt-6 !bg-info/15 !border-0 !text-ink"
          onClick={onSkip}
        >
          나중에 할게요
        </Button>
      </div>
    </PhoneShell>
  );
}
