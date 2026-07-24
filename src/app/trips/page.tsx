"use client";

import Image from "next/image";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { formatDateKo } from "@/lib/logic";
import { useMorgo } from "@/lib/store";
import { TRIP_STATUS_LABELS } from "@/lib/types";

export default function TripsPage() {
  return (
    <AppShell>
      <TripsContent />
    </AppShell>
  );
}

function TripsContent() {
  const trips = useMorgo((s) => s.trips);

  return (
    <div>
      <h1 className="text-xl font-extrabold">내 여행</h1>
      {trips.length === 0 ? (
        <div className="mt-14 text-center text-morgo-navy/45">
          <Image
            src="/character/wondering.png"
            alt="궁금한 모로고"
            width={110}
            height={110}
            className="mx-auto rounded-3xl"
          />
          <p className="mt-3 text-sm">아직 여행이 없어요.</p>
          <Link
            href="/trip/new"
            className="mt-4 inline-block rounded-xl bg-morgo-navy px-6 py-3 font-bold text-white"
          >
            모르고 떠나기
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {trips.map((t) => (
            <Link
              key={t.id}
              href={`/trip/${t.id}`}
              className="flex items-center justify-between rounded-xl bg-morgo-card p-4 shadow-sm active:bg-morgo-yellow-soft"
            >
              <div>
                <div className="font-semibold">
                  {formatDateKo(t.conditions.checkInDate)} 출발
                </div>
                <div className="mt-0.5 text-xs text-morgo-navy/50">
                  {t.conditions.departure.label} ·{" "}
                  {t.booking?.bookingNumber ?? "예약 전"}
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  t.status === "REVEALED"
                    ? "bg-morgo-mint-soft text-morgo-navy"
                    : t.status === "REVEAL_WAITING"
                      ? "bg-morgo-navy text-morgo-yellow"
                      : t.status === "CANCELLED"
                        ? "bg-morgo-navy/5 text-morgo-navy/45"
                        : "bg-morgo-yellow-soft text-morgo-navy"
                }`}
              >
                {TRIP_STATUS_LABELS[t.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
