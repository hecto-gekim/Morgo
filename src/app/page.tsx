"use client";

import Image from "next/image";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import EventBanner from "@/components/EventBanner";
import RandomTripLauncher from "@/components/RandomTripLauncher";
import { formatDateKo } from "@/lib/logic";
import { useMorgo } from "@/lib/store";
import { TRIP_STATUS_LABELS } from "@/lib/types";

export default function HomePage() {
  return (
    <AppShell>
      <HomeContent />
    </AppShell>
  );
}

function HomeContent() {
  const user = useMorgo((s) => s.user)!;
  const trips = useMorgo((s) => s.trips);
  const activeTrip = trips.find((t) =>
    ["REVEAL_WAITING", "REVEALED", "TRIP_IN_PROGRESS"].includes(t.status),
  );

  return (
    <div>
      <header className="flex items-end justify-between pt-2">
        <div>
          <p className="text-sm text-morgo-navy/55">
            안녕하세요, {user.nickname}님
          </p>
          <h1 className="mt-1 text-2xl font-extrabold leading-snug">
            이번 주말,
            <br />
            어디로 <span className="text-morgo-pink">튈지</span> 아무도
            몰라요
          </h1>
        </div>
        <Image
          src="/character/wave.png"
          alt="인사하는 모로고"
          width={96}
          height={134}
          priority
          className="shrink-0"
        />
      </header>

      <EventBanner />

      {activeTrip && (
        <Link
          href={`/trip/${activeTrip.id}`}
          className="mt-5 block rounded-2xl bg-morgo-navy p-5 text-white shadow-lg shadow-morgo-navy/20"
        >
          <div className="text-xs text-morgo-yellow">
            {TRIP_STATUS_LABELS[activeTrip.status]}
          </div>
          <div className="mt-1 text-lg font-bold">
            {formatDateKo(activeTrip.conditions.checkInDate)} 출발 여행
          </div>
          <div className="mt-1 text-sm opacity-80">
            {activeTrip.status === "REVEAL_WAITING"
              ? "목적지는 출발 당일 오전 3시에 공개돼요 →"
              : "이미 걸렸어요. 도망 못 가요 →"}
          </div>
        </Link>
      )}

      <RandomTripLauncher>
        {(open) => (
          <button
            type="button"
            onClick={open}
            className="mt-5 flex w-full items-center justify-between rounded-2xl bg-morgo-navy p-5 text-left text-white shadow-lg shadow-morgo-navy/20 active:bg-morgo-navy-deep"
          >
            <div>
              <div className="font-extrabold">🎯 핀 던지고 각오해</div>
              <div className="mt-0.5 text-sm opacity-80">
                어디 걸릴지 모름 → 룰렛이 시키는 대로 무조건 실행
              </div>
            </div>
            <span className="text-2xl opacity-70">→</span>
          </button>
        )}
      </RandomTripLauncher>

      <section className="mt-8">
        <h2 className="font-bold">Morgo는 이렇게 굴러가요</h2>
        <ol className="mt-3 space-y-2.5">
          {[
            "핀을 던지면 그걸로 끝. 도망 못 감",
            "도착하자마자 AI 룰렛이 미션을 던짐",
            "사진으로 인증하면 포인트, 못 하면 쫄?",
            "살아남으면 지도에 전적이 새겨짐",
          ].map((step, i) => (
            <li
              key={step}
              className="flex items-start gap-3 rounded-xl bg-morgo-card p-3.5 text-sm shadow-sm"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-morgo-yellow text-xs font-extrabold text-morgo-navy">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      {trips.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">내 여행</h2>
            <Link href="/trips" className="text-sm font-semibold text-morgo-pink">
              전체 보기
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {trips.slice(0, 3).map((t) => (
              <Link
                key={t.id}
                href={`/trip/${t.id}`}
                className="flex items-center justify-between rounded-xl bg-morgo-card p-4 shadow-sm active:bg-morgo-yellow-soft"
              >
                <div>
                  <div className="text-sm font-semibold">
                    {formatDateKo(t.conditions.checkInDate)} 출발
                  </div>
                  <div className="text-xs text-morgo-navy/50">
                    {t.conditions.departure.label}에서 ·{" "}
                    {TRIP_STATUS_LABELS[t.status]}
                  </div>
                </div>
                <span className="text-morgo-navy/25">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
