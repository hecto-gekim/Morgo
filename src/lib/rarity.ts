import { getCurrentEvent } from "./logic";
import type { Rarity } from "./types";

/** 핀 던지기 결과 등급 표시 문구 (공통) */
export const RARITY_LABELS: Record<Rarity, string> = {
  common: "",
  rare: "✨ 레어",
  epic: "💜 에픽",
  legendary: "👑 전설",
};

/** 기본 등급 확률: 일반 70% · 레어 22% · 에픽 7% · 전설 1% */
const BASE_WEIGHTS: { tier: Rarity; weight: number }[] = [
  { tier: "common", weight: 70 },
  { tier: "rare", weight: 22 },
  { tier: "epic", weight: 7 },
  { tier: "legendary", weight: 1 },
];

/** 이만큼 연속으로 일반 등급이 나오면 다음 판은 최소 레어로 확정 (천장/pity) */
export const PITY_THRESHOLD = 8;

/**
 * 0~1 seed로 등급을 뽑는다. "레어 확률 UP" 이벤트가 진행 중이면
 * common을 제외한 나머지 가중치에 배율을 곱해 실제로 확률을 올린다.
 */
export function rollRarity(seed: number, now: Date = new Date()): Rarity {
  const event = getCurrentEvent(now);
  const boost = event.effect.type === "rarity" ? event.effect.multiplier : 1;
  const table = BASE_WEIGHTS.map((r) =>
    r.tier === "common" ? r : { ...r, weight: r.weight * boost },
  );
  const total = table.reduce((s, r) => s + r.weight, 0);
  let x = seed * total;
  for (const r of table) {
    if (x < r.weight) return r.tier;
    x -= r.weight;
  }
  return "common";
}

/** 천장 적용 — pityCount가 임계치를 넘겼는데 이번에 또 common이 나오면 레어로 올려준다 */
export function applyPity(natural: Rarity, pityCount: number): Rarity {
  if (natural === "common" && pityCount >= PITY_THRESHOLD) return "rare";
  return natural;
}
