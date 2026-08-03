"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import CharacterImage from "@/components/CharacterImage";
import EventBanner from "@/components/EventBanner";
import RandomTripLauncher, { LAUNCH_COPY } from "@/components/RandomTripLauncher";
import { formatDateKo } from "@/lib/logic";
import { useMorgo } from "@/lib/store";
import {
  THEME_EMOJI,
  THEME_LABELS,
  TRIP_STATUS_LABELS,
  type TripTheme,
} from "@/lib/types";

const THEMES: TripTheme[] = ["normal", "horror", "parents", "baby"];

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
  const theme = useMorgo((s) => s.theme);
  const setTheme = useMorgo((s) => s.setTheme);
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
            오늘,
            <br />
            어디로 <span className="text-morgo-pink">튈지</span> 아무도
            몰라요
          </h1>
        </div>
        <CharacterImage
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
              : "목적지 정해졌어요. 이어서 보기 →"}
          </div>
        </Link>
      )}

      {/* 홈에서 바로 테마 선택 → 아래 버튼으로 목적지 정하기 */}
      <section className="mt-6">
        <h2 className="text-sm font-bold text-morgo-navy/70">여행 테마 고르기</h2>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {THEMES.map((t) => {
            const active = theme === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs font-bold ${
                  active
                    ? "bg-morgo-navy text-morgo-yellow"
                    : "border border-morgo-navy/15 bg-morgo-card text-morgo-navy/70"
                }`}
              >
                <span className="text-xl">{THEME_EMOJI[t]}</span>
                <span>{THEME_LABELS[t]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <RandomTripLauncher>
        {(open, t) => (
          <button
            type="button"
            onClick={open}
            className="mt-3 flex w-full items-center justify-between rounded-2xl bg-morgo-navy p-5 text-left text-white shadow-lg shadow-morgo-navy/20 active:bg-morgo-navy-deep"
          >
            <div>
              <div className="font-extrabold">{LAUNCH_COPY[t].cta}</div>
              <div className="mt-0.5 text-sm opacity-80">
                {LAUNCH_COPY[t].sub}
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
            theme === "horror"
              ? "주술로 소환하면 오늘 끌려갈 곳이 정해져요"
              : theme === "parents" || theme === "baby"
                ? "장소를 뽑으면 오늘 갈 곳이 정해져요"
                : "다트를 던지면 오늘의 목적지가 정해져요",
            "도착하면 AI 룰렛이 미션을 정해줘요",
            "미션을 인증하면 포인트가 쌓여요",
            "다녀온 곳은 지도에 전적으로 남아요",
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
