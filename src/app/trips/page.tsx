"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import CharacterImage from "@/components/CharacterImage";
import RandomTripLauncher, { LAUNCH_COPY } from "@/components/RandomTripLauncher";
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
  const deleteTrip = useMorgo((s) => s.deleteTrip);
  const resetAll = useMorgo((s) => s.resetAll);

  return (
    <div>
      <h1 className="text-xl font-extrabold">내 여행</h1>
      {trips.length === 0 ? (
        <div className="mt-14 text-center text-morgo-navy/45">
          <CharacterImage
            src="/character/wondering.png"
            alt="궁금한 모로고"
            width={110}
            height={110}
            className="mx-auto rounded-3xl"
          />
          <RandomTripLauncher>
            {(open, theme) => (
              <>
                <p className="mt-3 text-sm">
                  {theme === "horror"
                    ? "아직 아무것도 소환 안 했네요. 주술진부터 그려볼까요?"
                    : theme === "parents" || theme === "baby"
                      ? "아직 목적지를 안 뽑았네요. 갈 곳부터 정해볼까요?"
                      : "아직 던진 적 없네요. 다트부터 던져볼까요?"}
                </p>
                <button
                  type="button"
                  onClick={open}
                  className="mt-4 inline-block rounded-xl bg-morgo-navy px-6 py-3 font-bold text-white"
                >
                  {LAUNCH_COPY[theme].short}
                </button>
              </>
            )}
          </RandomTripLauncher>
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {trips.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-xl bg-morgo-card p-4 shadow-sm"
              >
                <Link href={`/trip/${t.id}`} className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {formatDateKo(t.conditions.checkInDate)} 출발
                  </div>
                  <div className="mt-0.5 text-xs text-morgo-navy/50">
                    {t.conditions.departure.label}에서 출발
                  </div>
                </Link>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    t.status === "REVEALED"
                      ? "bg-morgo-mint-soft text-morgo-navy"
                      : t.status === "REVEAL_WAITING"
                        ? "bg-morgo-navy text-morgo-yellow"
                        : t.status === "FAILED"
                          ? "bg-morgo-pink/15 text-morgo-pink"
                          : t.status === "CANCELLED"
                            ? "bg-morgo-navy/5 text-morgo-navy/45"
                            : "bg-morgo-yellow-soft text-morgo-navy"
                  }`}
                >
                  {TRIP_STATUS_LABELS[t.status]}
                </span>
                <button
                  type="button"
                  aria-label="여행 삭제"
                  onClick={() => {
                    if (window.confirm("이 여행 내역을 삭제할까요?")) deleteTrip(t.id);
                  }}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-morgo-navy/5 text-morgo-navy/50"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "모든 여행·방문 기록·포인트를 초기화할까요? 되돌릴 수 없어요.",
                )
              )
                resetAll();
            }}
            className="mt-6 w-full rounded-xl border border-morgo-navy/15 py-3 text-sm font-semibold text-morgo-navy/55"
          >
            전체 초기화 (여행·기록·포인트 모두 삭제)
          </button>
        </>
      )}
    </div>
  );
}
