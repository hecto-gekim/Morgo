"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { todayStr, totalEarnedPoints } from "@/lib/logic";
import { resolveCurrentDeparture } from "@/lib/geo";
import { useMorgo } from "@/lib/store";
import type {
  Departure,
  HorrorSpot,
  PlaceSpot,
  Rarity,
  TripTheme,
} from "@/lib/types";
import DartMapReveal from "./DartMapReveal";
import HorrorSummon from "./HorrorSummon";
import ThemeDestinationPicker from "./ThemeDestinationPicker";

/** 테마별 실행 버튼 문구 (홈/미션 화면 공용) */
export const LAUNCH_COPY: Record<
  TripTheme,
  { cta: string; sub: string; short: string }
> = {
  normal: {
    cta: "🎯 다트 던지러 가기",
    sub: "던진 다트가 정한 곳으로, 오늘 바로 출발",
    short: "🎯 다트 던지러 가기",
  },
  horror: {
    cta: "🔮 주술로 소환하러 가기",
    sub: "주술진이 부른 그곳으로, 오늘 바로 끌려간다",
    short: "🔮 주술 소환하러 가기",
  },
  parents: {
    cta: "🧡 부모님과 갈 곳 찾기",
    sub: "부모님과 다니기 좋은 곳으로, 오늘 바로 출발",
    short: "🧡 부모님과 갈 곳 찾기",
  },
  baby: {
    cta: "🍼 아이와 갈 곳 찾기",
    sub: "아이가 즐길 수 있는 곳으로, 오늘 바로 출발",
    short: "🍼 아이와 갈 곳 찾기",
  },
};

/**
 * 오늘의 목적지를 정하는 트리거. 테마에 따라 연출이 달라진다.
 *  - 일반: 지도에 다트 던지기
 *  - 공포: 공포 명소 소환
 *  - 부모/아이: 테마 맞춤 장소 뽑기(절·수목원 / 박물관·체험관)
 * children이 open 콜백과 현재 theme을 받아 원하는 버튼을 렌더링한다.
 */
export default function RandomTripLauncher({
  children,
}: {
  children: (open: () => void, theme: TripTheme) => React.ReactNode;
}) {
  const router = useRouter();
  const createInstantTrip = useMorgo((s) => s.createInstantTrip);
  const trips = useMorgo((s) => s.trips);
  const cityRecords = useMorgo((s) => s.cityRecords);
  const spentPoints = useMorgo((s) => s.spentPoints);
  const spendPoints = useMorgo((s) => s.spendPoints);
  const pityCount = useMorgo((s) => s.pityCount);
  const recordThrowRarity = useMorgo((s) => s.recordThrowRarity);
  const theme = useMorgo((s) => s.theme);
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const pointsAvailable = totalEarnedPoints(trips) - spentPoints;

  // 이미 갔던(방문 기록) 도시 + 취소 안 된 여행의 도시는 다시 뽑지 않는다
  const excludeCityIds = useMemo(() => {
    const set = new Set<string>(Object.keys(cityRecords));
    for (const t of trips) if (t.status !== "CANCELLED") set.add(t.cityId);
    return [...set];
  }, [trips, cityRecords]);

  // 하루 1회 — 오늘 이미 목적지를 뽑았으면(취소 안 된 오늘자 여행) 다시 못 뽑는다
  const drewToday = useMemo(() => {
    const today = todayStr();
    return trips.some(
      (t) => t.status !== "CANCELLED" && t.conditions.checkInDate === today,
    );
  }, [trips]);

  const handleOpen = () => {
    if (drewToday) setBlocked(true);
    else setOpen(true);
  };

  const confirm = async (
    cityId: string,
    rarity: Rarity,
    spot?: HorrorSpot | PlaceSpot,
  ) => {
    // 출발지를 현재 위치(oo시 oo동)로 — 권한 거부/실패 시 프리셋으로 폴백
    let departure: Departure | undefined;
    try {
      departure = await resolveCurrentDeparture();
    } catch {
      departure = undefined;
    }
    const id = createInstantTrip(cityId, rarity, spot, departure);
    setOpen(false);
    router.push(`/trip/${id}`);
  };

  const renderModal = () => {
    if (theme === "horror") {
      return (
        <HorrorSummon
          onConfirm={confirm}
          onClose={() => setOpen(false)}
          excludeCityIds={excludeCityIds}
        />
      );
    }
    if (theme === "parents" || theme === "baby") {
      return (
        <ThemeDestinationPicker
          theme={theme}
          onConfirm={confirm}
          onClose={() => setOpen(false)}
          excludeCityIds={excludeCityIds}
        />
      );
    }
    return (
      <DartMapReveal
        onConfirm={confirm}
        onClose={() => setOpen(false)}
        pointsAvailable={pointsAvailable}
        onSpendPoints={spendPoints}
        pityCount={pityCount}
        onThrowResult={recordThrowRarity}
        horror={false}
        excludeCityIds={excludeCityIds}
      />
    );
  };

  return (
    <>
      {children(handleOpen, theme)}
      {open && renderModal()}
      {blocked && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-morgo-navy/85 p-5">
          <div className="w-full max-w-xs rounded-3xl bg-morgo-card p-6 text-center shadow-2xl">
            <div className="text-4xl">🌙</div>
            <h2 className="mt-2 text-lg font-extrabold">
              오늘 목적지는 이미 정했어요
            </h2>
            <p className="mt-1 text-sm text-morgo-navy/60">
              하루에 한 번만 뽑을 수 있어요. 내일 다시 도전하거나, 여행 내역을
              지우면 새로 뽑을 수 있어요.
            </p>
            <Link
              href="/trips"
              onClick={() => setBlocked(false)}
              className="mt-4 block w-full rounded-xl bg-morgo-navy py-3 font-bold text-white"
            >
              여행 내역 보기
            </Link>
            <button
              type="button"
              onClick={() => setBlocked(false)}
              className="mt-2 w-full rounded-xl border border-morgo-navy/15 py-3 font-semibold text-morgo-navy/70"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
