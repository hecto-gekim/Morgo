"use client";

// 룰렛 챌린지 생성기. 서버 /api/roulette (Claude) 를 호출해 도시 맞춤 챌린지를
// 받아오고, 키가 없거나 오류면 로컬 덱(spinRoulette)으로 폴백한다.

import { getCity, getCityExtra, spinRoulette } from "./seed";
import type { Mission } from "./types";

let seq = 0;
const uid = () => `spin-${Date.now().toString(36)}-${seq++}`;

/** 로컬 덱으로 count개 (중복 최소화) */
function localBatch(cityId: string, exclude: string[], count: number): Mission[] {
  const used = new Set(exclude);
  const out: Mission[] = [];
  for (let i = 0; i < count; i++) {
    const m = spinRoulette(cityId, [...used]);
    used.add(m.title);
    out.push({ ...m, id: uid() });
  }
  return out;
}

/**
 * 룰렛 챌린지 batch 생성. AI 우선, 실패 시 로컬 폴백.
 * exclude 제목은 피해서 생성한다.
 */
export async function generateChallenges(
  cityId: string,
  exclude: string[],
  count: number,
): Promise<Mission[]> {
  const city = getCity(cityId);
  const extra = getCityExtra(cityId);
  if (!city) return localBatch(cityId, exclude, count);

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
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.configured === false || !Array.isArray(data.challenges)) {
      return localBatch(cityId, exclude, count);
    }
    const challenges = (data.challenges as Omit<Mission, "id" | "cityId">[])
      .filter((c) => c.title)
      .map((c) => ({ ...c, id: uid(), cityId }) as Mission);
    return challenges.length > 0 ? challenges : localBatch(cityId, exclude, count);
  } catch {
    return localBatch(cityId, exclude, count);
  }
}
