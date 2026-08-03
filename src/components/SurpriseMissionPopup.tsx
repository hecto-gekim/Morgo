"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { randomGhostImage } from "@/lib/ghost";
import { fileToThumbDataUrl } from "@/lib/image";
import { useMorgo } from "@/lib/store";
import type { Mission } from "@/lib/types";

type Phase = "idle" | "open" | "success" | "missed";

const SURPRISE_MIN_MS = 30_000;
const SURPRISE_MAX_MS = 75_000;
const RESPONSE_SECONDS = 15;
const SURPRISE_POINTS = 20;
const HOLD_MS = 5000; // 공포 모드: 숨 참고 버텨야 하는 시간

function makeSurpriseMission(horror: boolean): Mission {
  if (horror) {
    return {
      id: `surprise-${Date.now().toString(36)}`,
      title: "👻 숨 참기",
      description: "유령이 지나간다. 화면을 꾹 누르고 숨을 참아! 손 떼면 들킨다.",
      category: "DARE",
      emoji: "👻",
      points: SURPRISE_POINTS,
    };
  }
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
 * 일반 모드는 '지금 찍기' 사진 인증, 공포 모드는 '숨 참기'(꾹 눌러 버티기)로 바뀐다.
 * 앱이 켜져있을 때만 동작 — 진짜 백그라운드 푸시는 서버+서비스워커가 필요해서 별도 작업.
 */
export default function SurpriseMissionPopup({
  tripId,
  horror = false,
}: {
  tripId: string;
  /** 이 트립이 공포 트립인지 — 전역 토글이 아니라 트립 기준으로 넘겨받는다 */
  horror?: boolean;
}) {
  const addTripMission = useMorgo((s) => s.addTripMission);
  const submitMission = useMorgo((s) => s.submitMission);
  const resolveMission = useMorgo((s) => s.resolveMission);

  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [missionId, setMissionId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(RESPONSE_SECONDS);
  // 공포 모드에서 미션을 놓쳤을 때 튀어나오는 놀래키기용 유령 사진
  const [scareImg, setScareImg] = useState<string | null>(null);
  // 공포 모드 '숨 참기' 진행도 (0~1)
  const [holdProgress, setHoldProgress] = useState(0);
  const holdingRef = useRef(false);
  const holdRafRef = useRef<number | null>(null);

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
      const mission = makeSurpriseMission(horror);
      addTripMission(tripId, mission);
      setMissionId(mission.id);
      setCountdown(RESPONSE_SECONDS);
      setHoldProgress(0);
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

  // 미션을 놓쳤을 때 처리 — 공포 모드면 유령 점프스케어
  const fail = () => {
    holdingRef.current = false;
    if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    setScareImg(horror ? randomGhostImage() : null);
    setPhase("missed");
    window.setTimeout(() => {
      setScareImg(null);
      setPhase("idle");
      setCycle((c) => c + 1);
    }, 2200);
  };

  const succeed = (proofUrl: string) => {
    if (!missionId) return;
    submitMission(tripId, missionId, proofUrl);
    resolveMission(tripId, missionId, "PASSED", 1);
    setPhase("success");
    window.setTimeout(() => {
      setPhase("idle");
      setCycle((c) => c + 1);
    }, 1600);
  };

  // 응답 제한시간 카운트다운 (숨 참는 중에는 멈춘다)
  useEffect(() => {
    if (phase !== "open") return;
    const t = setInterval(() => {
      if (holdingRef.current) return; // 버티는 중엔 시간이 흐르지 않음
      setCountdown((s) => {
        if (s > 1) return s - 1;
        clearInterval(t);
        fail();
        return 0;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const onCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !missionId) return;
    const url = await fileToThumbDataUrl(file, 900);
    succeed(url);
  };

  // 공포 모드 '숨 참기' — 꾹 누르는 동안 버티기 게이지가 차오른다
  const startHold = () => {
    if (phase !== "open" || !horror || holdingRef.current) return;
    holdingRef.current = true;
    const start = performance.now();
    const tick = (now: number) => {
      if (!holdingRef.current) return;
      const p = Math.min(1, (now - start) / HOLD_MS);
      setHoldProgress(p);
      if (p >= 1) {
        holdingRef.current = false;
        succeed(randomGhostImage()); // 버텨낸 증거로 유령 컷 한 장
        return;
      }
      holdRafRef.current = requestAnimationFrame(tick);
    };
    holdRafRef.current = requestAnimationFrame(tick);
  };

  const releaseHold = () => {
    if (!holdingRef.current) return; // 이미 성공했거나 안 누르고 있었음
    holdingRef.current = false;
    if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    fail(); // 시간 안에 손을 떼면 들킨다
  };

  useEffect(
    () => () => {
      if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    },
    [],
  );

  // 사용자가 직접 닫기 — 미션은 목록에 남고(나중에 재도전 가능), 다음 깜짝 미션을 다시 예약
  const dismiss = () => {
    setPhase("idle");
    setCycle((c) => c + 1);
  };

  if (phase === "idle") return null;

  // 공포 모드에서 놓쳤을 때: 전체화면 유령 점프스케어
  if (phase === "missed" && scareImg) {
    return (
      <div
        onClick={dismiss}
        className="fixed inset-0 z-[70] grid cursor-pointer place-items-center overflow-hidden bg-black"
      >
        <Image
          src={scareImg}
          alt=""
          fill
          sizes="100vw"
          priority
          className="object-cover"
          style={{ animation: "scare-pop 200ms ease-out" }}
        />
        <div className="relative text-center">
          <div className="text-7xl drop-shadow-[0_0_14px_rgba(0,0,0,0.9)]">😱</div>
          <p className="mt-2 text-lg font-extrabold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)]">
            들켰다… 뒤에 뭐 있어
          </p>
        </div>
      </div>
    );
  }

  const holdSecondsLeft = Math.max(0, Math.ceil((1 - holdProgress) * (HOLD_MS / 1000)));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-morgo-navy/85 p-4">
      <div className="relative w-full max-w-xs rounded-3xl bg-morgo-cream p-6 text-center shadow-2xl">
        {phase === "open" && horror && (
          <>
            <button
              type="button"
              onClick={dismiss}
              aria-label="닫기"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-morgo-navy/10 text-lg leading-none text-morgo-navy/60"
            >
              ✕
            </button>
            <div className="text-4xl">👻</div>
            <h2 className="mt-2 text-lg font-extrabold">숨 참아!</h2>
            <p className="mt-1 text-sm text-morgo-navy/55">
              유령이 지나간다. 꾹 누르고 버텨… 손 떼면 들켜 (+{SURPRISE_POINTS}P)
            </p>
            {/* 버티기 게이지: 누르는 동안 차오르고, 다 차면 통과 */}
            <div className="relative mx-auto mt-4 grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-morgo-navy/10">
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 bg-morgo-pink/70"
                style={{ height: `${holdProgress * 100}%`, transition: "none" }}
              />
              <span className="relative text-2xl font-extrabold text-morgo-navy">
                {holdProgress > 0 ? holdSecondsLeft : "👻"}
              </span>
            </div>
            <button
              type="button"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                startHold();
              }}
              onPointerUp={releaseHold}
              onPointerCancel={releaseHold}
              onContextMenu={(e) => e.preventDefault()}
              className="mt-5 block min-h-[52px] w-full touch-none select-none content-center rounded-xl bg-morgo-navy font-extrabold text-white"
            >
              {holdProgress > 0 ? "그대로 버텨…" : "🫢 꾹 눌러 숨 참기"}
            </button>
            <p className="mt-2 text-[11px] text-morgo-navy/40">
              시작 전 남은 시간 {countdown}s
            </p>
          </>
        )}
        {phase === "open" && !horror && (
          <>
            <button
              type="button"
              onClick={dismiss}
              aria-label="닫기"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-morgo-navy/10 text-lg leading-none text-morgo-navy/60"
            >
              ✕
            </button>
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
            <div className="text-4xl">{horror ? "🫠" : "🎉"}</div>
            <h2 className="mt-2 text-lg font-extrabold text-morgo-navy">
              {horror ? "버텨냈다!" : "성공!"} +{SURPRISE_POINTS}P
            </h2>
            <p className="mt-1 text-sm text-morgo-navy/55">
              {horror ? "유령이 그냥 지나갔어…" : "역시 빠르네"}
            </p>
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
