"use client";

import Countdown from "@/components/Countdown";
import { getCurrentEvent } from "@/lib/logic";
import { useHydrated } from "@/lib/store";

/**
 * 홈 상단 이벤트 배너. 진입 즉시 진행 중인 주간 이벤트와
 * 종료까지 남은 시간을 카운트다운으로 보여준다.
 */
export default function EventBanner() {
  // 이벤트 계산은 new Date()에 의존 → 하이드레이션 후 렌더 시 계산해 SSR 불일치 방지
  const hydrated = useHydrated();
  if (!hydrated) {
    return <div className="mt-5 h-[86px] rounded-2xl bg-morgo-yellow-soft/60" />;
  }
  const event = getCurrentEvent();

  return (
    <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-morgo-yellow to-morgo-yellow-soft p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/70 text-2xl">
          {event.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-morgo-navy px-2 py-0.5 text-[10px] font-bold text-morgo-yellow">
              진행 중 이벤트
            </span>
            <span className="truncate text-sm font-extrabold text-morgo-navy">
              {event.title}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-morgo-navy/70">
            {event.tagline}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-white/60 px-3 py-2">
        <span className="text-[11px] font-semibold text-morgo-navy/60">
          🎁 {event.reward} · 종료까지
        </span>
        <Countdown targetIso={event.endsAt} compact />
      </div>
    </div>
  );
}
