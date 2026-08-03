"use client";

// 룰렛 챌린지 생성기. 서버 /api/roulette (Claude) 를 호출해 도시 맞춤 챌린지를
// 받아오고, 키가 없거나 오류면 로컬 덱(spinRoulette)으로 폴백한다.

import { getCity, getCityExtra, landmarkMissionOf, spinRoulette } from "./seed";
import type { HorrorSpot, Mission, Rarity, TripMission, TripTheme } from "./types";

let seq = 0;
const uid = () => `spin-${Date.now().toString(36)}-${seq++}`;

/** 로컬 덱으로 count개 (중복 최소화) */
function localBatch(
  cityId: string,
  exclude: string[],
  count: number,
  theme: TripTheme = "normal",
): Mission[] {
  const used = new Set(exclude);
  const out: Mission[] = [];
  for (let i = 0; i < count; i++) {
    const m = spinRoulette(cityId, [...used], theme);
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
  theme: TripTheme,
): Promise<RouletteBatch> {
  const horror = theme === "horror";
  const city = getCity(cityId);
  const extra = getCityExtra(cityId);
  if (!city) return { missions: localBatch(cityId, exclude, count, theme) };

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
        theme,
        // 구버전 서버 호환 — theme 무시하는 서버도 공포 여부는 알아듣게
        horror,
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.configured === false || !Array.isArray(data.challenges)) {
      return { missions: localBatch(cityId, exclude, count, theme) };
    }
    const challenges = (data.challenges as Omit<Mission, "id" | "cityId">[])
      .filter((c) => c.title)
      .map((c) => ({ ...c, id: uid(), cityId }) as Mission);
    const missions =
      challenges.length > 0 ? challenges : localBatch(cityId, exclude, count, theme);
    const spot: HorrorSpot | undefined =
      data.spot?.name && data.spot?.description
        ? { name: data.spot.name, description: data.spot.description }
        : undefined;
    return { missions, spot };
  } catch {
    return { missions: localBatch(cityId, exclude, count, theme) };
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
  theme: TripTheme = "normal",
): Promise<Mission[]> {
  return (await fetchRouletteBatch(cityId, exclude, count, theme)).missions;
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
 * 미리 정해진 목적지로 "반드시 방문(사진 인증)" 필수 미션을 만든다.
 * 공포는 안전 경고 포함 ☠️, 부모/아이 등은 따뜻한 관광지 방문 톤으로.
 */
function makeVisitMission(spot: HorrorSpot, theme: TripTheme): Mission {
  const id = `visit-${Date.now().toString(36)}`;
  if (theme === "horror") {
    return {
      id,
      title: `☠️ 필수: ${spot.name} 다녀오기`,
      description: `오늘의 공포 목적지 「${spot.name}」! 그곳까지 가서 인증하라. 📸 인증 기준: ${spot.name}임을 알 수 있는 간판·표지·특징 구조물이 프레임에 또렷이 보여야 함. 단, 건물·시설 안엔 절대 들어가지 말고(무단진입·폐가 내부 금지) 밝은 도로변 등 바깥 공개된 곳에서만 찍을 것.`,
      category: "HORROR",
      emoji: "🪦",
      points: 40,
    };
  }
  return {
    id,
    title: `📍 필수: ${spot.name} 다녀오기`,
    description: `오늘의 목적지 「${spot.name}」! 그곳에 가서 인증 사진을 남겨보세요. 📸 인증 기준: ${spot.name}임을 알 수 있는 간판·표지·대표 풍경이 프레임에 보이게 찍으세요.`,
    category: "LANDMARK",
    emoji: "📍",
    points: 35,
  };
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
  theme: TripTheme = "normal",
  presetSpot?: HorrorSpot,
): Promise<StartMissions> {
  const hasPreset = !!presetSpot;
  // 목적지가 미리 정해졌으면(공포 소환 / 부모·아이 장소 뽑기) 그 방문이 곧 관광지이므로
  // 자동 관광지 미션은 생략한다.
  const landmark = theme === "horror" || hasPreset ? null : landmarkMissionOf(cityId);
  // 필수 방문 미션이 한 자리를 차지하므로 AI 챌린지를 하나 줄인다
  const aiCount = (landmark ? 3 : 4) - (hasPreset ? 1 : 0);
  const { missions: rest, spot: foundSpot } = await fetchRouletteBatch(
    cityId,
    landmark ? [landmark.title] : [],
    Math.max(aiCount, 1),
    theme,
  );
  // 미리 정해진 목적지 우선(소환/장소 뽑기), 없으면 AI가 찾은 명소(공포)
  const spot = presetSpot ?? foundSpot;
  const visit = spot ? makeVisitMission(spot, theme) : null;
  const bonus = bonusMissionFor(rarity, getCity(cityId)?.name ?? "이 도시");
  // 필수 방문 미션을 맨 앞에 고정
  const all = [
    ...(visit ? [visit] : []),
    ...(landmark ? [landmark] : []),
    ...rest,
    ...(bonus ? [bonus] : []),
  ];
  return {
    missions: all.map((mission) => ({ mission, status: "ASSIGNED" as const })),
    spot,
  };
}
