"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Countdown from "@/components/Countdown";
import MissionCard from "@/components/MissionCard";
import Roulette from "@/components/Roulette";
import ShareCard from "@/components/ShareCard";
import SurpriseMissionPopup from "@/components/SurpriseMissionPopup";
import { formatDateKo, formatWon } from "@/lib/logic";
import { RARITY_LABELS } from "@/lib/rarity";
import { generateStartMissions } from "@/lib/roulette-ai";
import { cityLabel, getAccommodation, getCity, getCityExtra } from "@/lib/seed";
import { useMorgo } from "@/lib/store";
import {
  FACILITY_LABELS,
  TRIP_STATUS_LABELS,
  type Accommodation,
  type Trip,
} from "@/lib/types";

export default function TripDetailPage() {
  return (
    <AppShell>
      <TripDetail />
    </AppShell>
  );
}

// 규칙 기반 준비물 추천 (명세서 19장) — 공개 전에는 도시를 유추할 수 없는 항목만
function packingHints(acc: Accommodation | undefined): string[] {
  if (!acc) return [];
  const hints: string[] = ["편한 옷", "충전기", "세면도구"];
  if (acc.facilities.includes("POOL")) hints.push("수영복", "방수팩", "수건");
  if (acc.facilities.includes("BBQ")) hints.push("식재료", "개인 양념");
  if (acc.facilities.includes("JACUZZI")) hints.push("입욕제");
  if (acc.facilities.includes("PET")) hints.push("사료", "배변 패드", "리드줄");
  if (acc.type === "CAMPING" || acc.type === "GLAMPING")
    hints.push("벌레 퇴치제", "얇은 겉옷");
  return hints;
}

function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const trip = useMorgo((s) => s.trips.find((t) => t.id === id));
  const reveal = useMorgo((s) => s.reveal);

  const tryReveal = useCallback(() => {
    if (trip) reveal(trip.id);
  }, [trip, reveal]);

  // 공개 시각이 이미 지났다면 진입 시 즉시 공개 처리
  useEffect(() => {
    tryReveal();
  }, [tryReveal]);

  if (!trip) {
    return (
      <p className="py-20 text-center text-morgo-navy/40">
        여행을 찾을 수 없어요.
      </p>
    );
  }

  if (trip.status === "CONDITION_COMPLETED") {
    return (
      <ResumeCard
        trip={trip}
        text="숙소 후보가 준비되어 있어요."
        href={`/trip/${trip.id}/offers`}
        cta="블라인드 숙소 보러 가기"
      />
    );
  }
  if (trip.status === "ACCOMMODATION_SELECTED") {
    return (
      <ResumeCard
        trip={trip}
        text="숙소 선택이 끝났어요. 테스트 결제만 남았어요."
        href={`/trip/${trip.id}/payment`}
        cta="테스트 결제하러 가기"
      />
    );
  }
  if (trip.status === "CANCELLED") {
    return (
      <p className="py-20 text-center text-morgo-navy/40">취소된 여행이에요.</p>
    );
  }

  if (trip.status === "REVEAL_WAITING" && trip.booking) {
    return (
      <WaitingView
        trip={trip}
        onForceReveal={() => reveal(trip.id, { force: true })}
        onDue={tryReveal}
      />
    );
  }

  if (
    trip.status === "REVEALED" ||
    trip.status === "TRIP_IN_PROGRESS" ||
    trip.status === "COMPLETED"
  ) {
    return <RevealedView trip={trip} />;
  }

  return (
    <p className="py-20 text-center text-morgo-navy/40">
      상태: {TRIP_STATUS_LABELS[trip.status]}
    </p>
  );
}

function ResumeCard({
  trip,
  text,
  href,
  cta,
}: {
  trip: Trip;
  text: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="mx-auto max-w-xl pt-10 text-center">
      <Image
        src="/character/map.png"
        alt="지도를 보는 모로고"
        width={140}
        height={144}
        className="mx-auto rounded-3xl"
      />
      <h1 className="mt-4 text-xl font-extrabold">
        {formatDateKo(trip.conditions.checkInDate)} 출발 여행
      </h1>
      <p className="mt-2 text-sm text-morgo-navy/55">{text}</p>
      <Link
        href={href}
        className="mt-6 block min-h-[52px] content-center rounded-xl bg-morgo-navy font-bold text-white"
      >
        {cta}
      </Link>
    </div>
  );
}

function WaitingView({
  trip,
  onForceReveal,
  onDue,
}: {
  trip: Trip;
  onForceReveal: () => void;
  onDue: () => void;
}) {
  const acc = trip.bookedAccommodationId
    ? getAccommodation(trip.bookedAccommodationId)
    : undefined;

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-3xl bg-morgo-navy p-6 text-center text-white shadow-lg shadow-morgo-navy/25">
        <Image
          src="/character/wondering.png"
          alt="어디일까 궁금한 모로고"
          width={90}
          height={90}
          priority
          className="mx-auto rounded-2xl"
        />
        <p className="mt-3 text-sm opacity-90">목적지 공개까지</p>
        <div className="mt-3">
          <Countdown targetIso={trip.booking!.revealAt} onDone={onDue} />
        </div>
        <p className="mt-4 text-xs opacity-70">
          {formatDateKo(trip.conditions.checkInDate)} 오전 3시에 공개돼요
        </p>
        <p className="mt-1 font-mono text-xs opacity-50">
          {trip.booking!.bookingNumber}
        </p>
      </div>

      <section className="mt-6">
        <h2 className="font-bold">🔮 여행 힌트</h2>
        <div className="mt-3 space-y-2 text-sm">
          <div className="rounded-xl bg-morgo-card p-4 shadow-sm">
            숙소 유형과 편의시설만 살짝 알려드릴게요. 도시는 끝까지 비밀!
          </div>
          {acc && (
            <div className="rounded-xl bg-morgo-card p-4 shadow-sm">
              <div className="font-semibold">{acc.blindTitle}</div>
              <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-morgo-navy/60">
                {acc.facilities.map((f) => (
                  <span
                    key={f}
                    className="rounded bg-morgo-mint-soft px-1.5 py-0.5"
                  >
                    {FACILITY_LABELS[f]}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-bold">🎒 준비물 추천</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {packingHints(acc).map((h) => (
            <span
              key={h}
              className="rounded-full bg-morgo-card px-3 py-1.5 text-sm text-morgo-navy/70 shadow-sm"
            >
              {h}
            </span>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={onForceReveal}
        className="mt-8 w-full rounded-xl border border-dashed border-morgo-navy/25 py-3 text-sm text-morgo-navy/45"
      >
        🛠️ 지금 바로 공개하기 (개발용)
      </button>
    </div>
  );
}

function RevealedView({ trip }: { trip: Trip }) {
  const completeTrip = useMorgo((s) => s.completeTrip);
  const addTripMission = useMorgo((s) => s.addTripMission);
  const setTripMissions = useMorgo((s) => s.setTripMissions);
  const horrorMode = useMorgo((s) => s.horrorMode);
  const [showShare, setShowShare] = useState(false);
  const acc = trip.bookedAccommodationId
    ? getAccommodation(trip.bookedAccommodationId)
    : undefined;
  const city = getCity(trip.cityId);
  const extra = getCityExtra(trip.cityId);

  // 공개 화면 첫 진입 시, 도착 룰렛과 같은 AI 엔진으로 시작 미션 4개를 그 자리에서 생성
  const hasMissions = !!trip.missions && trip.missions.length > 0;
  useEffect(() => {
    if (hasMissions) return;
    let alive = true;
    generateStartMissions(trip.cityId, trip.rarity, horrorMode).then(
      ({ missions, spot }) => {
        if (alive) setTripMissions(trip.id, missions, spot);
      },
    );
    return () => {
      alive = false;
    };
  }, [trip.id, trip.cityId, trip.rarity, hasMissions, setTripMissions, horrorMode]);

  if (!city) {
    return (
      <p className="py-20 text-center text-morgo-navy/40">
        정보를 찾을 수 없어요.
      </p>
    );
  }

  const mapUrl = `https://map.naver.com/p/search/${encodeURIComponent(acc?.name ?? city.name)}`;
  const missions = trip.missions ?? [];
  const passed = missions.filter((m) => m.status === "PASSED");
  const missionDone = passed.length;
  const points = passed.reduce((n, m) => n + (m.earnedPoints ?? m.mission.points), 0);
  const isCompleted = trip.status === "COMPLETED";

  return (
    <div className="mx-auto max-w-xl">
      <div className="overflow-hidden rounded-3xl bg-morgo-card shadow-lg shadow-morgo-navy/10">
        <div className="grid h-44 w-full place-items-center bg-gradient-to-br from-morgo-navy via-morgo-navy to-morgo-pink text-center">
          <div>
            {trip.rarity && trip.rarity !== "common" && (
              <div className="mb-1.5 inline-block rounded-full bg-morgo-yellow px-2.5 py-1 text-xs font-extrabold text-morgo-navy">
                {RARITY_LABELS[trip.rarity]} 지역
              </div>
            )}
            <div className="text-xs font-bold tracking-wide text-morgo-yellow">
              🎯 당첨
            </div>
            <div className="mt-1 text-3xl font-extrabold text-white">
              {cityLabel(city)}
            </div>
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-morgo-pink">
                🎊 목적지가 공개되었어요!
              </p>
              <h1 className="mt-1 text-2xl font-extrabold">{cityLabel(city)}</h1>
              {acc && (
                <>
                  <p className="mt-1 font-semibold text-morgo-navy/80">{acc.name}</p>
                  <p className="mt-0.5 text-sm text-morgo-navy/55">{acc.address}</p>
                </>
              )}
            </div>
            <Image
              src="/character/luggage.png"
              alt="떠나는 모로고"
              width={92}
              height={95}
              className="shrink-0 rounded-2xl"
            />
          </div>

          {acc && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Info
                  label="체크인"
                  value={`${formatDateKo(trip.conditions.checkInDate)} ${acc.checkInTime}`}
                />
                <Info
                  label="체크아웃"
                  value={`${formatDateKo(trip.conditions.checkOutDate)} ${acc.checkOutTime}`}
                />
                <Info label="예약번호" value={trip.booking?.bookingNumber ?? "-"} mono />
                <Info label="1박 요금(테스트)" value={formatWon(acc.price)} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1 text-[11px] text-morgo-navy/60">
                {acc.facilities.map((f) => (
                  <span key={f} className="rounded bg-morgo-mint-soft px-1.5 py-0.5">
                    {FACILITY_LABELS[f]}
                  </span>
                ))}
              </div>
            </>
          )}

          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 block min-h-[48px] content-center rounded-xl bg-morgo-navy text-center font-bold text-white"
          >
            🗺️ 네이버 지도에서 보기
          </a>
        </div>
      </div>

      <section className="mt-4">
        <Roulette
          cityId={trip.cityId}
          excludeTitles={missions.map((m) => m.mission.title)}
          onAccept={(m) => addTripMission(trip.id, m)}
        />
      </section>

      {horrorMode ? (
        trip.horrorSpot && (
          <section className="mt-4 rounded-2xl bg-morgo-navy p-5 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-morgo-yellow">이 도시의 공포 명소</h2>
              <span className="rounded-full bg-morgo-pink px-2.5 py-1 text-[11px] font-bold text-white">
                👻 실화
              </span>
            </div>
            <div className="mt-3 rounded-xl bg-white/10 p-3">
              <div className="text-[11px] text-white/50">추천 장소</div>
              <div className="mt-0.5 font-semibold">🕯️ {trip.horrorSpot.name}</div>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                {trip.horrorSpot.description}
              </p>
            </div>
          </section>
        )
      ) : (
        extra && (
          <section className="mt-4 rounded-2xl bg-morgo-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">이 도시, 이렇게 즐겨요</h2>
              <span className="rounded-full bg-morgo-yellow-soft px-2.5 py-1 text-[11px] font-bold text-morgo-navy/70">
                ✨ 추천
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-morgo-mint-soft p-3">
                <div className="text-[11px] text-morgo-navy/50">대표 관광지</div>
                <div className="mt-0.5 font-semibold">
                  {extra.landmarkEmoji} {extra.landmark}
                </div>
              </div>
              <div className="rounded-xl bg-morgo-yellow-soft p-3">
                <div className="text-[11px] text-morgo-navy/50">대표 음식</div>
                <div className="mt-0.5 font-semibold">🍽️ {extra.food}</div>
              </div>
            </div>
          </section>
        )
      )}

      <section className="mt-6">
        {missions.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold">📸 미션 & 룰렛 도전</h2>
              <span className="text-sm font-semibold text-morgo-pink">
                {missionDone}/{missions.length} 성공 · {points}P
              </span>
            </div>
            <p className="mt-0.5 text-xs text-morgo-navy/50">
              사진으로 인증하면 포인트가 쌓여요. 결과는 카드로 공유할 수 있어요.
            </p>
            <div className="mt-3 space-y-2.5">
              {missions.map((m) => (
                <MissionCard key={m.mission.id} tripId={trip.id} tm={m} />
              ))}
            </div>
            {missionDone > 0 && (
              <button
                type="button"
                onClick={() => setShowShare(true)}
                className="mt-3 w-full rounded-xl bg-morgo-pink py-3 font-extrabold text-morgo-navy"
              >
                🎉 결과 카드 공유하기
              </button>
            )}
          </>
        ) : (
          <div className="rounded-2xl bg-morgo-navy p-5 text-center text-sm font-semibold text-morgo-yellow shadow-sm">
            🎯 AI가 미션 뽑는 중… 각오해
          </div>
        )}
      </section>

      {showShare && (
        <ShareCard
          city={city}
          missions={missions}
          points={points}
          rarity={trip.rarity}
          onClose={() => setShowShare(false)}
        />
      )}

      {(trip.status === "REVEALED" || trip.status === "TRIP_IN_PROGRESS") && (
        <SurpriseMissionPopup tripId={trip.id} />
      )}

      {acc && (
        <div className="mt-4 rounded-xl bg-morgo-yellow-soft px-4 py-3 text-xs leading-relaxed text-morgo-navy/75">
          테스트 예약이므로 실제 숙박 시설에는 예약되어 있지 않아요. 즐거운 여행
          되세요!
        </div>
      )}

      {isCompleted ? (
        <div className="mt-4 rounded-2xl bg-morgo-mint-soft p-5 text-center">
          <div className="text-lg font-extrabold text-morgo-navy">
            ✅ 여행을 완료했어요!
          </div>
          <p className="mt-1 text-sm text-morgo-navy/60">
            {city.name}이(가) 방문 지도에 기록되었어요.
          </p>
          <Link
            href="/map"
            className="mt-4 inline-block rounded-xl bg-morgo-navy px-6 py-3 font-bold text-white"
          >
            🗺️ 지도에서 보고 사진 남기기
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            completeTrip(trip.id);
            setShowShare(true); // 완료 즉시 하이라이트 카드로 짜잔
          }}
          className="mt-4 w-full rounded-xl border-2 border-morgo-navy bg-morgo-card py-3.5 font-bold text-morgo-navy"
        >
          여행 완료하고 지도에 기록하기
        </button>
      )}

      <Link
        href="/"
        className="mt-3 block py-2 text-center text-sm text-morgo-navy/50"
      >
        홈으로
      </Link>
    </div>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-morgo-cream p-3">
      <div className="text-[11px] text-morgo-navy/45">{label}</div>
      <div
        className={`mt-0.5 font-semibold ${mono ? "font-mono text-xs" : "text-sm"}`}
      >
        {value}
      </div>
    </div>
  );
}
