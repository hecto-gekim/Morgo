"use client";

import { useEffect, useRef, useState } from "react";
import { generateChallenges } from "@/lib/roulette-ai";
import { ROULETTE_FACES, spinRoulette } from "@/lib/seed";
import { MISSION_CATEGORY_LABELS, type Mission, type TripTheme } from "@/lib/types";

type Phase = "idle" | "spinning" | "result";

/**
 * 도착 룰렛. 스핀할 때마다 도시 맞춤 챌린지가 나온다.
 * AI(키 설정 시)가 매번 새 챌린지를 생성하고, 미리 받아둔 큐에서 즉시 꺼내 쓴다.
 * 이미 나온 챌린지는 피해서 뽑으므로 여러 번 돌려도 겹치지 않는다.
 */
export default function Roulette({
  cityId,
  excludeTitles = [],
  theme = "normal",
  onAccept,
}: {
  cityId: string;
  /** 이미 이 여행에서 나온 챌린지 제목(중복 방지) */
  excludeTitles?: string[];
  /** 이 트립의 테마 — 전역 토글이 아니라 트립 기준으로 판단 (미션 톤 결정) */
  theme?: TripTheme;
  onAccept: (mission: Mission) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [face, setFace] = useState(ROULETTE_FACES[0]);
  const [result, setResult] = useState<Mission | null>(null);

  const queue = useRef<Mission[]>([]);
  const used = useRef<Set<string>>(new Set(excludeTitles));
  const refilling = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const refill = async () => {
    if (refilling.current) return;
    refilling.current = true;
    try {
      const batch = await generateChallenges(
        cityId,
        [...used.current].slice(-40),
        10,
        theme,
      );
      for (const m of batch) {
        if (!used.current.has(m.title)) queue.current.push(m);
      }
    } finally {
      refilling.current = false;
    }
  };

  useEffect(() => {
    refill(); // 첫 진입 시 미리 받아둠
    const ref = timers;
    return () => ref.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nextChallenge = (): Mission => {
    while (queue.current.length) {
      const m = queue.current.shift()!;
      if (!used.current.has(m.title)) return m;
    }
    // 큐가 비었으면(아직 로딩 중이거나 AI 미설정) 로컬 덱으로 즉시 폴백
    return spinRoulette(cityId, [...used.current], theme);
  };

  const spin = () => {
    if (phase === "spinning") return;
    setPhase("spinning");
    setResult(null);

    const picked = nextChallenge();
    used.current.add(picked.title);
    if (queue.current.length < 4) refill();

    const start = Date.now();
    const duration = 2200;
    const tick = () => {
      const elapsed = Date.now() - start;
      setFace(ROULETTE_FACES[Math.floor(Math.random() * ROULETTE_FACES.length)]);
      if (elapsed < duration) {
        timers.current.push(setTimeout(tick, 60 + (elapsed / duration) * 180));
      } else {
        setFace(picked.emoji);
        setResult(picked);
        setPhase("result");
      }
    };
    tick();
  };

  return (
    <div className="rounded-3xl bg-morgo-navy p-6 text-center text-white shadow-lg shadow-morgo-navy/25">
      <div className="text-sm font-bold text-morgo-yellow">
        {theme === "parents" || theme === "baby"
          ? "🎲 미션 더 받기"
          : "🎰 도착 룰렛"}
      </div>
      <p className="mt-1 text-xs opacity-75">
        {theme === "parents" || theme === "baby"
          ? "원하면 미션을 더 뽑아 함께 도전해요"
          : "뭘 시킬지는 룰렛 맘. 거절 못 함"}
      </p>

      <div
        className={`mx-auto mt-5 grid h-28 w-28 place-items-center rounded-3xl bg-white/10 text-6xl ${
          phase === "spinning" ? "animate-pulse" : ""
        }`}
      >
        <span className={phase === "spinning" ? "blur-[1px]" : ""}>{face}</span>
      </div>

      {phase === "result" && result ? (
        <div className="mt-5">
          <div className="rounded-2xl bg-white/10 p-4 text-left">
            <span className="rounded-full bg-morgo-pink px-2 py-0.5 text-[10px] font-bold text-morgo-navy">
              {MISSION_CATEGORY_LABELS[result.category]} · +{result.points}P
            </span>
            <div className="mt-2 text-lg font-extrabold">{result.title}</div>
            <p className="mt-1 text-sm opacity-85">{result.description}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={spin}
              className="min-h-[48px] flex-1 rounded-xl border border-white/25 font-bold text-white/80"
            >
              😨 이건 못 해, 재도전
            </button>
            <button
              type="button"
              onClick={() => onAccept(result)}
              className="min-h-[48px] flex-[1.5] rounded-xl bg-morgo-yellow font-extrabold text-morgo-navy"
            >
              🔥 이대로 간다
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={spin}
          disabled={phase === "spinning"}
          className="mt-6 min-h-[52px] w-full rounded-xl bg-morgo-yellow font-extrabold text-morgo-navy disabled:opacity-70"
        >
          {phase === "spinning"
            ? "미션 뽑는 중…"
            : theme === "parents" || theme === "baby"
              ? "미션 하나 더 뽑기 🎲"
              : "돌린다, 룰렛한테 맡긴다 🎲"}
          {/* spinning 라벨은 테마 공통으로 '미션 뽑는 중' — 도박 톤 최소화 */}
        </button>
      )}
    </div>
  );
}
