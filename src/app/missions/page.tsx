"use client";

import Image from "next/image";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import MissionCard from "@/components/MissionCard";
import { formatDateKo } from "@/lib/logic";
import { getCity } from "@/lib/seed";
import { useMorgo } from "@/lib/store";
import type { Trip } from "@/lib/types";

export default function MissionsPage() {
  return (
    <AppShell>
      <MissionsContent />
    </AppShell>
  );
}

const MISSION_STATUSES = ["REVEALED", "TRIP_IN_PROGRESS", "COMPLETED"];

function totalPoints(trips: Trip[]): number {
  return trips
    .flatMap((t) => t.missions ?? [])
    .filter((m) => m.status === "PASSED")
    .reduce((n, m) => n + m.mission.points, 0);
}

function badgeOf(points: number): { emoji: string; name: string; next?: number } {
  if (points >= 300) return { emoji: "👑", name: "여행의 달인" };
  if (points >= 150) return { emoji: "🏆", name: "베테랑 탐험가", next: 300 };
  if (points >= 60) return { emoji: "🥈", name: "떠오르는 여행가", next: 150 };
  if (points >= 20) return { emoji: "🥉", name: "새내기 탐험가", next: 60 };
  return { emoji: "🌱", name: "여행 입문자", next: 20 };
}

function MissionsContent() {
  const trips = useMorgo((s) => s.trips);

  // 미션이 배정된(공개 이후) 모든 여행 — 여행별로 볼 수 있게 그룹화
  const missionTrips = trips.filter(
    (t) => t.missions && t.missions.length > 0 && MISSION_STATUSES.includes(t.status),
  );
  const waitingTrip = trips.find((t) => t.status === "REVEAL_WAITING");

  const points = totalPoints(trips);
  const badge = badgeOf(points);
  const passedCount = trips
    .flatMap((t) => t.missions ?? [])
    .filter((m) => m.status === "PASSED").length;

  return (
    <div>
      <h1 className="text-xl font-extrabold">여행 미션</h1>

      {/* 포인트 · 배지 요약 */}
      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-morgo-navy p-5 text-white shadow-lg shadow-morgo-navy/20">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-3xl">
          {badge.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-morgo-yellow">{badge.name}</div>
          <div className="text-2xl font-extrabold">
            {points}
            <span className="ml-1 text-sm font-normal opacity-70">P</span>
          </div>
          {badge.next && (
            <div className="mt-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-morgo-yellow"
                  style={{ width: `${Math.min(100, (points / badge.next) * 100)}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] opacity-70">
                다음 배지까지 {badge.next - points}P · 미션 {passedCount}개 성공
              </div>
            </div>
          )}
        </div>
      </div>

      {missionTrips.length > 0 ? (
        <div className="mt-6 space-y-7">
          {missionTrips.map((trip) => (
            <TripMissions key={trip.id} trip={trip} />
          ))}
        </div>
      ) : waitingTrip ? (
        <EmptyState
          image="/character/wondering.png"
          title="여행이 공개되면 미션이 등장해요"
          desc="목적지가 공개되는 순간, 그 도시에 맞는 미션 4개가 배정됩니다."
          cta={{ href: `/trip/${waitingTrip.id}`, label: "카운트다운 보러 가기" }}
        />
      ) : (
        <EmptyState
          image="/character/camera.png"
          title="아직 진행 중인 미션이 없어요"
          desc="여행을 예약하고 목적지가 공개되면 사진 미션에 도전할 수 있어요."
          cta={{ href: "/trip/new", label: "모르고 떠나기" }}
        />
      )}
    </div>
  );
}

function TripMissions({ trip }: { trip: Trip }) {
  const missions = trip.missions ?? [];
  const done = missions.filter((m) => m.status === "PASSED").length;
  const city = getCity(trip.cityId);

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold">
            {city ? city.name : "여행"} 미션
          </h2>
          <p className="text-xs text-morgo-navy/45">
            {formatDateKo(trip.conditions.checkInDate)} 여행
            {trip.status === "COMPLETED" && " · 완료"}
          </p>
        </div>
        <span className="rounded-full bg-morgo-pink-soft px-2.5 py-1 text-xs font-bold text-morgo-navy">
          {done}/{missions.length} 성공
        </span>
      </div>
      <div className="mt-3 space-y-2.5">
        {missions.map((m) => (
          <MissionCard key={m.mission.id} tripId={trip.id} tm={m} />
        ))}
      </div>
    </section>
  );
}

function EmptyState({
  image,
  title,
  desc,
  cta,
}: {
  image: string;
  title: string;
  desc: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="mt-12 text-center text-morgo-navy/55">
      <Image
        src={image}
        alt=""
        width={120}
        height={124}
        className="mx-auto rounded-3xl"
      />
      <h2 className="mt-3 font-bold text-morgo-navy">{title}</h2>
      <p className="mt-1 text-sm">{desc}</p>
      <Link
        href={cta.href}
        className="mt-5 inline-block rounded-xl bg-morgo-navy px-6 py-3 font-bold text-white"
      >
        {cta.label}
      </Link>
    </div>
  );
}
