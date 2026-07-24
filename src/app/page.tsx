"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import EventBanner from "@/components/EventBanner";
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
  const router = useRouter();
  const user = useMorgo((s) => s.user)!;
  const trips = useMorgo((s) => s.trips);
  const createInstantTrip = useMorgo((s) => s.createInstantTrip);
  const activeTrip = trips.find((t) =>
    ["REVEAL_WAITING", "REVEALED", "TRIP_IN_PROGRESS"].includes(t.status),
  );

  const startInstant = () => {
    const id = createInstantTrip();
    router.push(`/trip/${id}`);
  };

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
            어디로 갈지 <span className="text-morgo-pink">모르고</span>{" "}
            떠나볼까요?
          </h1>
        </div>
        <Image
          src="/character/wave.png"
          alt="인사하는 모로고"
          width={96}
          height={122}
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
              : "목적지가 공개되었어요! 확인하러 가기 →"}
          </div>
        </Link>
      )}

      <button
        type="button"
        onClick={startInstant}
        className="mt-5 flex w-full items-center justify-between rounded-2xl bg-morgo-navy p-5 text-left text-white shadow-lg shadow-morgo-navy/20 active:bg-morgo-navy-deep"
      >
        <div>
          <div className="font-extrabold">🎰 지금 여기서 룰렛 여행</div>
          <div className="mt-0.5 text-sm opacity-80">
            랜덤 도시로 순간이동 → 룰렛이 시키는 대로!
          </div>
        </div>
        <span className="text-2xl opacity-70">→</span>
      </button>

      <Link
        href="/trip/new"
        className="mt-3 flex items-center justify-between rounded-2xl border-2 border-morgo-yellow bg-morgo-yellow-soft p-5 active:bg-morgo-yellow/40"
      >
        <div>
          <div className="font-extrabold text-morgo-navy">🎲 조건 골라 떠나기</div>
          <div className="mt-0.5 text-sm text-morgo-navy/60">
            출발지·예산 정하고 공개 카운트다운까지
          </div>
        </div>
        <span className="text-2xl text-morgo-navy/50">→</span>
      </Link>

      <section className="mt-8">
        <h2 className="font-bold">Morgo는 이렇게 진행돼요</h2>
        <ol className="mt-3 space-y-2.5">
          {[
            "출발지·날짜·예산 등 조건을 입력해요",
            "도시를 숨긴 블라인드 숙소 후보를 보여드려요",
            "사진과 편의시설만 보고 1~3순위를 골라요",
            "테스트 결제 후 예약이 완료돼요",
            "출발 당일 오전 3시, 목적지가 공개돼요!",
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
