import { ACCOMMODATIONS, CITIES } from "./seed";
import type {
  Accommodation,
  City,
  DistanceRange,
  MorgoEvent,
  Trip,
  TripConditions,
} from "./types";

/** 성공한 미션들의 포인트 총합(평생 획득량 — 배지 등급용, 포인트 사용과 무관하게 줄지 않음) */
export function totalEarnedPoints(trips: Trip[]): number {
  return trips
    .flatMap((t) => t.missions ?? [])
    .filter((m) => m.status === "PASSED")
    .reduce((n, m) => n + (m.earnedPoints ?? m.mission.points), 0);
}

/** 두 좌표 간 거리(km) — 하버사인 공식 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function inRange(km: number, range: DistanceRange): boolean {
  switch (range) {
    case "UNDER_100":
      return km < 100;
    case "FROM_100_TO_200":
      return km >= 100 && km < 200;
    case "FROM_200_TO_300":
      return km >= 200 && km < 300;
    case "OVER_300":
      return km >= 300;
    case "ANY":
      return true;
  }
}

function matchesConditions(acc: Accommodation, cond: TripConditions): boolean {
  if (
    cond.accommodationTypes.length > 0 &&
    !cond.accommodationTypes.includes(acc.type)
  ) {
    return false;
  }
  if (cond.maximumBudget > 0 && acc.price > cond.maximumBudget) return false;
  if (!cond.requiredFacilities.every((f) => acc.facilities.includes(f))) {
    return false;
  }
  const guests = cond.adultCount + cond.childCount;
  if (guests > acc.maxCapacity) return false;
  if (cond.petCount > 0 && !acc.facilities.includes("PET")) return false;
  return true;
}

export interface TripPlan {
  cityId: string;
  offerIds: string[];
}

/**
 * 명세서 8장 도시 선정 로직의 Phase 1 구현.
 * 거리 구간 → 조건 일치 숙소 보유 도시 → 랜덤 선정.
 * 조건이 너무 좁아 후보가 없으면 조건을 단계적으로 완화한다.
 */
export function createTripPlan(cond: TripConditions): TripPlan | null {
  const candidates = CITIES.map((city) => ({
    city,
    km: haversineKm(
      cond.departure.latitude,
      cond.departure.longitude,
      city.officeLatitude,
      city.officeLongitude,
    ),
  })).filter(({ km }) => inRange(km, cond.distanceRange));

  const withOffers = (
    cities: { city: City }[],
    filter: (a: Accommodation) => boolean,
  ) =>
    cities
      .map(({ city }) => ({
        city,
        offers: ACCOMMODATIONS.filter(
          (a) => a.cityId === city.id && filter(a),
        ),
      }))
      .filter(({ offers }) => offers.length >= 3);

  // 1차: 전체 조건 일치 → 2차: 편의시설 완화 → 3차: 유형·예산까지 완화
  let pool = withOffers(candidates, (a) => matchesConditions(a, cond));
  if (pool.length === 0) {
    pool = withOffers(candidates, (a) =>
      matchesConditions(a, { ...cond, requiredFacilities: [] }),
    );
  }
  if (pool.length === 0) {
    pool = withOffers(candidates, () => true);
  }
  if (pool.length === 0) return null;

  const picked = pool[Math.floor(Math.random() * pool.length)];
  const offers = [...picked.offers]
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);
  return { cityId: picked.city.id, offerIds: offers.map((o) => o.id) };
}

/** 체크인 당일 오전 3시 (로컬 시간 = Asia/Seoul 가정) */
export function revealAtOf(checkInDate: string): string {
  return new Date(`${checkInDate}T03:00:00+09:00`).toISOString();
}

export function makeBookingNumber(checkInDate: string, seq: number): string {
  const ymd = checkInDate.replaceAll("-", "");
  return `MORGO-${ymd}-${String(seq).padStart(4, "0")}`;
}

export function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

export function formatDateKo(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

/** 오늘 + n일 을 YYYY-MM-DD 로 */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ── 홈 이벤트 (재미 요소) ───────────────────────────────────

const WEEKLY_EVENTS: Omit<MorgoEvent, "id" | "endsAt">[] = [
  {
    title: "모르고 위크 🎡",
    tagline: "이번 주 미션 성공하면 포인트가 2배!",
    emoji: "🎡",
    reward: "미션 포인트 2배",
    effect: { type: "points", multiplier: 2 },
  },
  {
    title: "랜덤 여행 페스타 🎲",
    tagline: "이번 주는 핀 던질 때 레어 등급 확률이 올라가요",
    emoji: "🎲",
    reward: "레어 확률 UP",
    effect: { type: "rarity", multiplier: 1.8 },
  },
  {
    title: "폭주 위크 🔥",
    tagline: "이번 주 미션 성공 시 포인트 2배로 몰아준다",
    emoji: "🔥",
    reward: "미션 포인트 2배",
    effect: { type: "points", multiplier: 2 },
  },
];

/**
 * 현재 진행 중인 주간 이벤트. 매주 일요일 23:59(로컬)에 종료되며,
 * 주차에 따라 종류가 순환한다. 홈 진입 즉시 남은 시간을 보여주기 위한 값.
 */
export function getCurrentEvent(now: Date = new Date()): MorgoEvent {
  // 이번 주 일요일 23:59:59 로 종료 시각 계산 (일=0)
  const end = new Date(now);
  const daysUntilSunday = (7 - end.getDay()) % 7;
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);

  // 에폭 기준 주차로 이벤트 종류 순환 (결정론적)
  const weekIndex = Math.floor(end.getTime() / (7 * 86_400_000));
  const base = WEEKLY_EVENTS[weekIndex % WEEKLY_EVENTS.length];
  return { ...base, id: `event-${weekIndex}`, endsAt: end.toISOString() };
}

// ── 지도 좌표 투영 (명세서 16장 방문 지도) ───────────────────

/** 대한민국 대략 bounding box (제주 포함) */
export const KOREA_BOUNDS = {
  lngMin: 125.6,
  lngMax: 129.8,
  latMin: 33.0,
  latMax: 38.8,
};
export const MAP_VIEW = { w: 100, h: 138 };

/** 위·경도를 지도 SVG 좌표(MAP_VIEW 기준)로 투영 */
export function projectKorea(
  lat: number,
  lng: number,
): { x: number; y: number } {
  const { lngMin, lngMax, latMin, latMax } = KOREA_BOUNDS;
  const x = ((lng - lngMin) / (lngMax - lngMin)) * MAP_VIEW.w;
  const y = ((latMax - lat) / (latMax - latMin)) * MAP_VIEW.h;
  return { x, y };
}

/** 가장 가까운 시드 도시명 (GPS 라벨용) */
export function nearestCityLabel(lat: number, lng: number): string {
  let best: { name: string; km: number } | null = null;
  for (const c of CITIES) {
    const km = haversineKm(lat, lng, c.officeLatitude, c.officeLongitude);
    if (!best || km < best.km) best = { name: c.name, km };
  }
  return best ? `내 위치 · ${best.name} 근처` : "내 현재 위치";
}
