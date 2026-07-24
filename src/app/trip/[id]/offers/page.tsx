"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import BlindCard from "@/components/BlindCard";
import { getAccommodation } from "@/lib/seed";
import { useMorgo } from "@/lib/store";
import type { TripChoice } from "@/lib/types";

export default function OffersPage() {
  return (
    <AppShell maxWidth="max-w-5xl">
      <OffersContent />
    </AppShell>
  );
}

function OffersContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const trip = useMorgo((s) => s.trips.find((t) => t.id === id));
  const setChoices = useMorgo((s) => s.setChoices);

  const [selected, setSelected] = useState<string[]>(
    () =>
      trip?.choices
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((c) => c.accommodationId) ?? [],
  );

  const offers = useMemo(
    () =>
      (trip?.offerIds ?? [])
        .map(getAccommodation)
        .filter((a): a is NonNullable<typeof a> => Boolean(a)),
    [trip?.offerIds],
  );

  if (!trip) {
    return <p className="py-20 text-center text-morgo-navy/40">여행을 찾을 수 없어요.</p>;
  }

  const toggleSelect = (accId: string) => {
    setSelected((prev) =>
      prev.includes(accId)
        ? prev.filter((x) => x !== accId)
        : prev.length >= 3
          ? prev
          : [...prev, accId],
    );
  };

  const submit = () => {
    const choices = selected.map(
      (accId, i): TripChoice => ({
        accommodationId: accId,
        priority: (i + 1) as 1 | 2 | 3,
      }),
    );
    setChoices(trip.id, choices);
    router.push(`/trip/${trip.id}/payment`);
  };

  return (
    <div>
      <header>
        <h1 className="text-xl font-extrabold">블라인드 숙소 후보</h1>
        <p className="mt-1 text-sm text-morgo-navy/55">
          도시와 숙소 이름은 비밀! 카드를 눌러 <b>1 → 2 → 3순위</b> 순서로
          선택하세요. 다시 누르면 해제돼요.
        </p>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((acc) => {
          const idx = selected.indexOf(acc.id);
          return (
            <BlindCard
              key={acc.id}
              acc={acc}
              priority={idx >= 0 ? ((idx + 1) as 1 | 2 | 3) : undefined}
              onSelect={() => toggleSelect(acc.id)}
            />
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom))] z-30 border-t border-morgo-yellow-soft bg-morgo-card/95 p-3 backdrop-blur md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={submit}
            className="min-h-[48px] w-full rounded-xl bg-morgo-navy font-bold text-white disabled:bg-morgo-navy/20"
          >
            {selected.length === 0
              ? "숙소를 선택해 주세요"
              : `${selected.length}개 숙소로 테스트 결제하기`}
          </button>
        </div>
      </div>
      <div className="h-16 md:hidden" />
    </div>
  );
}
