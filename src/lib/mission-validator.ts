"use client";

// 미션 판정 인터페이스 (명세서 18.5).
// 서버의 /api/missions/validate 를 호출해 AI 판정을 시도하고,
// AI가 설정돼 있지 않거나(키 없음) 오류면 시뮬레이션 판정으로 폴백한다.

import type { Mission } from "./types";

export interface MissionVerdict {
  status: "PASSED" | "FAILED";
  confidence: number;
}

/** AI 없이 쓰는 시뮬레이션 판정 (명세서 18.5 초기 개발) */
function simulateVerdict(): MissionVerdict {
  const confidence =
    Math.random() < 0.15
      ? 0.4 + Math.random() * 0.08 // 가끔 재검토/실패
      : 0.86 + Math.random() * 0.13;
  return {
    status: confidence >= 0.5 ? "PASSED" : "FAILED",
    confidence: Number(confidence.toFixed(2)),
  };
}

export async function validateMission(
  imageDataUrl: string,
  mission: Mission,
): Promise<MissionVerdict> {
  try {
    const res = await fetch("/api/missions/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image: imageDataUrl,
        title: mission.title,
        description: mission.description,
        category: mission.category,
      }),
    });
    const data = await res.json();

    // 키 미설정 또는 오류 → 시뮬레이션 폴백
    if (!res.ok || data?.configured === false) return simulateVerdict();

    const confidence = Number(data.confidence) || 0;
    // 명세서 18.3: 0.85+ 성공 / 0.5~0.85 검토(여기선 통과 처리) / 0.5 미만 실패
    const status = data.match && confidence >= 0.5 ? "PASSED" : "FAILED";
    return { status, confidence: Number(confidence.toFixed(2)) };
  } catch {
    return simulateVerdict();
  }
}
