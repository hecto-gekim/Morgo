"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { formatDateKo, formatWon } from "@/lib/logic";
import { getAccommodation } from "@/lib/seed";
import { useMorgo } from "@/lib/store";

export default function PaymentPage() {
  return (
    <AppShell>
      <PaymentContent />
    </AppShell>
  );
}

function PaymentContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const trip = useMorgo((s) => s.trips.find((t) => t.id === id));
  const confirmBooking = useMorgo((s) => s.confirmBooking);
  const [processing, setProcessing] = useState(false);

  if (!trip) {
    return <p className="py-20 text-center text-morgo-navy/40">여행을 찾을 수 없어요.</p>;
  }

  const ordered = trip.choices
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((c) => ({ ...c, acc: getAccommodation(c.accommodationId)! }));
  const first = ordered[0];

  const pay = () => {
    if (processing) return; // 연속 클릭 방지 (명세서 23.3)
    setProcessing(true);
    // 테스트 결제 승인 시뮬레이션
    setTimeout(() => {
      confirmBooking(trip.id);
      router.replace(`/trip/${trip.id}/complete`);
    }, 1500);
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-extrabold">테스트 결제</h1>
      <p className="mt-1 text-sm text-morgo-navy/55">
        1순위부터 순서대로 재고를 확인해 예약해요.
      </p>

      <div className="mt-4 space-y-2">
        {ordered.map(({ priority, acc }) => (
          <div
            key={acc.id}
            className="flex items-center gap-3 rounded-xl bg-morgo-card p-4 shadow-sm"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-morgo-navy text-sm font-bold text-morgo-yellow">
              {priority}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{acc.blindTitle}</div>
              <div className="text-xs text-morgo-navy/50">⭐ {acc.ratingBand}</div>
            </div>
            <div className="font-bold">{formatWon(acc.price)}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-morgo-card p-4 shadow-sm text-sm">
        <div className="flex justify-between py-1">
          <span className="text-morgo-navy/55">일정</span>
          <span className="font-medium">
            {formatDateKo(trip.conditions.checkInDate)} ~{" "}
            {formatDateKo(trip.conditions.checkOutDate)} · 1박
          </span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-morgo-navy/55">인원</span>
          <span className="font-medium">
            성인 {trip.conditions.adultCount}
            {trip.conditions.childCount > 0 &&
              ` · 아동 ${trip.conditions.childCount}`}
            {trip.conditions.petCount > 0 &&
              ` · 반려동물 ${trip.conditions.petCount}`}
          </span>
        </div>
        <div className="mt-2 flex justify-between border-t border-morgo-navy/10 pt-3">
          <span className="font-bold">결제 금액 (1순위 기준)</span>
          <span className="text-lg font-extrabold text-morgo-pink">
            {first ? formatWon(first.acc.price) : "-"}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-morgo-yellow-soft px-4 py-3 text-xs leading-relaxed text-morgo-navy/75">
        ⚠️ 테스트 결제입니다. 실제로 결제되지 않으며, 실제 숙박 시설에도
        예약되지 않습니다.
      </div>

      <button
        type="button"
        onClick={pay}
        disabled={processing || !first}
        className="mt-5 min-h-[52px] w-full rounded-xl bg-morgo-navy font-bold text-white disabled:bg-morgo-navy/30"
      >
        {processing ? "결제 처리 중…" : "테스트 결제하기"}
      </button>
    </div>
  );
}
