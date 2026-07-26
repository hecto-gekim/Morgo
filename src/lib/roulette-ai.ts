"use client";

// 룰렛 챌린지 생성기. 서버 /api/roulette (Claude) 를 호출해 도시 맞춤 챌린지를
// 받아오고, 키가 없거나 오류면 로컬 덱(spinRoulette)으로 폴백한다.

import { getCity, getCityExtra, landmarkMissionOf, spinRoulette } from "./seed";
import type { HorrorSpot, Mission, Rarity, TripMission } from "./types";

let seq = 0;
const uid = () => `spin-${Date.now().toString(36)}-${seq++}`;

/** 로컬 덱으로 count개 (중복 최소화) */
function localBatch(
  cityId: string,
  exclude: string[],
  count: number,
  horror = false,
): Mission[] {
  const used = new Set(exclude);
  const out: Mission[] = [];
  for (let i = 0; i < count; i++) {
    const m = spinRoulette(cityId, [...used], horror);
    used.add(m.title);
    out.push({ ...m, id: uid() });
  }
  return out;
}

interface RouletteBatch {
  missions: Mission[];
  /** horror=true이고 AI가 실제 명소를 찾아준 경우에만 존재 (로컬 폴백 시엔 없음) */
  spot?: HorrorSpot;
}

/**
 * 룰렛 챌린지 batch 생성. AI 우선, 실패 시 로컬 폴백.
 * exclude 제목은 피해서 생성한다. horror=true면 전부 괴담/공포 컨셉으로만 뽑고,
 * 겸사겸사 AI가 검색으로 찾아낸 이 도시의 실존 공포 명소(spot)도 함께 받는다.
 */
async function fetchRouletteBatch(
  cityId: string,
  exclude: string[],
  count: number,
  horror: boolean,
): Promise<RouletteBatch> {
  const city = getCity(cityId);
  const extra = getCityExtra(cityId);
  if (!city) return { missions: localBatch(cityId, exclude, count, horror) };

  try {
    const res = await fetch("/api/roulette", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        city: city.name,
        province: city.provinceName,
        food: extra?.food,
        landmark: extra?.landmark,
        exclude,
        count,
        horror,
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.configured === false || !Array.isArray(data.challenges)) {
      return { missions: localBatch(cityId, exclude, count, horror) };
    }
    const challenges = (data.challenges as Omit<Mission, "id" | "cityId">[])
      .filter((c) => c.title)
      .map((c) => ({ ...c, id: uid(), cityId }) as Mission);
    const missions =
      challenges.length > 0 ? challenges : localBatch(cityId, exclude, count, horror);
    const spot: HorrorSpot | undefined =
      data.spot?.name && data.spot?.description
        ? { name: data.spot.name, description: data.spot.description }
        : undefined;
    return { missions, spot };
  } catch {
    return { missions: localBatch(cityId, exclude, count, horror) };
  }
}

/**
 * 룰렛 챌린지 batch 생성. AI 우선, 실패 시 로컬 폴백.
 * exclude 제목은 피해서 생성한다. horror=true면 전부 괴담/공포 컨셉으로만 뽑는다(공포 모드).
 */
export async function generateChallenges(
  cityId: string,
  exclude: string[],
  count: number,
  horror = false,
): Promise<Mission[]> {
  return (await fetchRouletteBatch(cityId, exclude, count, horror)).missions;
}

/** 레어 등급 이상 당첨 시 추가되는 진짜 보너스 미션 (포인트 실지급) */
function bonusMissionFor(rarity: Rarity | undefined, cityName: string): Mission | null {
  if (rarity === "epic") {
    return {
      id: `bonus-${Date.now()}`,
      title: "💜 에픽 보너스: 자랑샷 남기기",
      description: `100명 중 7명만 걸리는 에픽 지역! ${cityName}에서 제일 자랑하고 싶은 순간을 찍어보세요.`,
      category: "DARE",
      emoji: "💜",
      points: 50,
    };
  }
  if (rarity === "legendary") {
    return {
      id: `bonus-${Date.now()}`,
      title: "👑 전설 보너스: 인생 최고의 한 컷",
      description: `100명 중 1명만 걸리는 전설의 지역! ${cityName}에서 제일 미친 인증샷을 남겨보세요.`,
      category: "DARE",
      emoji: "👑",
      points: 100,
    };
  }
  return null;
}

interface StartMissions {
  missions: TripMission[];
  /** 공포 모드에서 AI가 찾아낸 이 도시의 실존 공포 명소 (로컬 폴백 시엔 없음) */
  spot?: HorrorSpot;
}

/**
 * 여행 공개 시점에 배정되는 시작 미션.
 * 관광지 인증샷 1개(있으면 고정) + AI가 그때그때 새로 뽑는 자극적인 챌린지(도착 룰렛과 동일 엔진) 3~4개.
 * 시드에 없는 전국 시군구는 관광지 데이터가 없을 수 있어, 그만큼 AI 챌린지를 더 받아 총 4개를 맞춘다.
 * 핀 던지기 등급이 epic/legendary면 진짜 포인트가 붙는 보너스 미션이 하나 더 추가된다.
 * 공포 모드면 관광지 인증샷 없이 4개 전부 괴담/공포 챌린지로 채우고, 이 도시의 실존 공포 명소도 함께 받는다.
 */
export async function generateStartMissions(
  cityId: string,
  rarity?: Rarity,
  horror = false,
): Promise<StartMissions> {
  const landmark = horror ? null : landmarkMissionOf(cityId);
  const aiCount = landmark ? 3 : 4;
  const { missions: rest, spot } = await fetchRouletteBatch(
    cityId,
    landmark ? [landmark.title] : [],
    aiCount,
    horror,
  );
  const missions = landmark ? [landmark, ...rest] : rest;
  const bonus = bonusMissionFor(rarity, getCity(cityId)?.name ?? "이 도시");
  const all = bonus ? [...missions, bonus] : missions;
  return {
    missions: all.map((mission) => ({ mission, status: "ASSIGNED" as const })),
    spot,
  };
}
