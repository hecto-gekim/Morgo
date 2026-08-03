"use client";

// 현재 위치 → 출발지(Departure) 해석.
// Kakao 리버스 지오코딩(/api/reverse-geocode)으로 "oo시 oo동"까지 뽑고,
// 키가 없거나 실패하면 시·군·구 근사(nearestCityLabel)로 폴백한다.

import { getCurrentPosition } from "./image";
import { nearestCityLabel } from "./logic";
import type { Departure } from "./types";

export async function resolveCurrentDeparture(): Promise<Departure> {
  const { latitude, longitude } = await getCurrentPosition();
  let label = "";
  try {
    const res = await fetch(
      `/api/reverse-geocode?lat=${latitude}&lng=${longitude}`,
    );
    const data = await res.json();
    if (data?.label) label = String(data.label);
  } catch {
    // 폴백은 아래에서
  }
  if (!label) label = nearestCityLabel(latitude, longitude);
  return { label, latitude, longitude };
}
