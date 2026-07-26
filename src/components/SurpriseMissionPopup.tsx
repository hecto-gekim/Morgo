"use client";

import { useEffect, useState } from "react";
import { fileToThumbDataUrl } from "@/lib/image";
import { useMorgo } from "@/lib/store";
import type { Mission } from "@/lib/types";

type Phase = "idle" | "open" | "success" | "missed";

const SURPRISE_MIN_MS = 30_000;
const SURPRISE_MAX_MS = 75_000;
const RESPONSE_SECONDS = 15;
const SURPRISE_POINTS = 20;

function makeSurpriseMission(): Mission {
  return {
    id: `surprise-${Date.now().toString(36)}`,
    title: "🚨 깜짝 미션",
    description: "지금 눈앞에 보이는 거 아무거나, 시간 안에 찍어!",
    category: "DARE",
    emoji: "🚨",
    points: SURPRISE_POINTS,
  };
}

/**
 * 여행 중 랜덤한 타이밍에 불쑥 뜨는 긴급 인증 미션 (셋로그 스타일).
 * 앱이 켜져있을 때만 동작 — 진짜 백그라운드 푸시는 서버+서비스워커가 필요해서 별도 작업.
 */
export default function SurpriseMissionPopup({ tripId }: { tripId: string }) {
  const addTripMission = useMorgo((s) => s.addTripMission);
  const submitMission = useMorgo((s) => s.submitMission);
  const resolveMission = useMorgo((s) => s.resolveMission);

  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [missionId, setMissionId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(RESPONSE_SECONDS);

  // 다음 깜짝 미션을 랜덤한 타이밍에 예약 (성공/놓침 후 cycle이 바뀌면 다시 예약)
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tryFire = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        timer = setTimeout(tryFire, 5000); // 백그라운드면 잠시 후 재시도
        return;
      }
      const mission = makeSurpriseMission();
      addTripMission(tripId, mission);
      setMissionId(mission.id);
      setCountdown(RESPONSE_SECONDS);
      setPhase("open");
    };

    const delay = SURPRISE_MIN_MS + Math.random() * (SURPRISE_MAX_MS - SURPRISE_MIN_MS);
    timer = setTimeout(tryFire, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, cycle]);

  // 응답 제한시간 카운트다운
  useEffect(() => {
    if (phase !== "open") return;
    const t = setInterval(() => {
      setCountdown((s) => {
        if (s > 1) return s - 1;
        clearInterval(t);
        setPhase("missed");
        window.setTimeout(() => {
          setPhase("idle");
          setCycle((c) => c + 1);
        }, 1600);
        return 0;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const onCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !missionId) return;
    const url = await fileToThumbDataUrl(file, 900);
    submitMission(tripId, missionId, url);
    resolveMission(tripId, missionId, "PASSED", 1);
    setPhase("success");
    window.setTimeout(() => {
      setPhase("idle");
      setCycle((c) => c + 1);
    }, 1600);
  };

  if (phase === "idle") return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-morgo-navy/85 p-4">
      <div className="w-full max-w-xs rounded-3xl bg-morgo-cream p-6 text-center shadow-2xl">
        {phase === "open" && (
          <>
            <div className="text-4xl">🚨</div>
            <h2 className="mt-2 text-lg font-extrabold">지금 당장 찍어!</h2>
            <p className="mt-1 text-sm text-morgo-navy/55">
              눈앞에 보이는 거 아무거나, 시간 안에 인증하면 +{SURPRISE_POINTS}P
            </p>
            <div className="mx-auto mt-4 grid h-20 w-20 place-items-center rounded-full bg-morgo-pink text-3xl font-extrabold text-white">
              {countdown}
            </div>
            <label className="mt-5 block min-h-[52px] cursor-pointer content-center rounded-xl bg-morgo-navy font-extrabold text-white">
              📷 지금 촬영
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onCapture}
              />
            </label>
          </>
        )}
        {phase === "success" && (
          <>
            <div className="text-4xl">🎉</div>
            <h2 className="mt-2 text-lg font-extrabold text-morgo-navy">
              성공! +{SURPRISE_POINTS}P
            </h2>
            <p className="mt-1 text-sm text-morgo-navy/55">역시 빠르네</p>
          </>
        )}
        {phase === "missed" && (
          <>
            <div className="text-4xl">⏱️</div>
            <h2 className="mt-2 text-lg font-extrabold text-morgo-navy">놓쳤다 ㅠㅠ</h2>
            <p className="mt-1 text-sm text-morgo-navy/55">
              괜찮아, 미션 목록에서 나중에 다시 도전할 수 있어요
            </p>
          </>
        )}
      </div>
    </div>
  );
}
