"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cityLabel, findCityByRegion } from "@/lib/seed";
import { useKoreaRegions } from "@/lib/useKoreaRegions";
import type { City, HorrorSpot, Rarity } from "@/lib/types";

type Phase = "summoning" | "revealed" | "empty";

interface SpotResult {
  city: City;
  spot: HorrorSpot;
}

const DASH = 1200; // 획을 그려나가는 stroke-dash 길이 (도형 둘레보다 크게)

/** 중심(100,100) 기준 극좌표 → 데카르트 (도 단위) */
function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
}
/** 반지름 r 위 start~end(도) 호 path */
function arc(r: number, start: number, end: number): string {
  const [x0, y0] = polar(r, start);
  const [x1, y1] = polar(r, end);
  const large = Math.abs(end - start) > 180 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/**
 * 소환진(마법진) — 별(펜타그램) 없이 이중 링 + 눈금 + 룬 점 + 회전 호로 그린 주술진.
 * 원·호가 순서대로 "그려지고" 두 겹이 서로 반대로 천천히 돌며 발광한다. 소환 중에만 렌더된다.
 */
function SummoningCircle() {
  const draw = (dur: string, delay = "0s") =>
    ({ animation: `summon-draw ${dur} ${delay} ease-out both` }) as const;

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <svg viewBox="0 0 200 200" className="aspect-square h-[118%]">
        {/* 바깥 겹: 시계방향 회전 (노랑) — 이중 링 + 눈금 */}
        <g
          style={{
            color: "#eaff00",
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: "summon-spin 18s linear infinite",
          }}
        >
          <circle
            cx="100"
            cy="100"
            r="93"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.85"
            strokeDasharray={DASH}
            style={{ ...draw("1.4s"), filter: "drop-shadow(0 0 4px currentColor)" }}
          />
          <circle cx="100" cy="100" r="86" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
          {Array.from({ length: 36 }).map((_, i) => {
            const [x1, y1] = polar(86, i * 10);
            const [x2, y2] = polar(i % 3 === 0 ? 78 : 82, i * 10);
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
            );
          })}
        </g>

        {/* 룬 점: 안 도는 정지 링에 8개 — 점멸 */}
        <g style={{ color: "#eab308" }}>
          {Array.from({ length: 8 }).map((_, i) => {
            const [x, y] = polar(72, i * 45 - 90);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="2.6"
                fill="currentColor"
                style={{
                  filter: "drop-shadow(0 0 3px currentColor)",
                  animation: `summon-flicker ${1.4 + (i % 4) * 0.25}s ease-in-out infinite`,
                }}
              />
            );
          })}
        </g>

        {/* 안쪽 겹: 반대로 회전 (핑크) — 링 + 끊긴 호 3개 */}
        <g
          style={{
            color: "#e91e63",
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: "summon-spin-rev 12s linear infinite",
          }}
        >
          <circle
            cx="100"
            cy="100"
            r="58"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.8"
            strokeDasharray={DASH}
            style={{ ...draw("1.6s", "0.2s"), filter: "drop-shadow(0 0 4px currentColor)" }}
          />
          {[0, 120, 240].map((s, i) => (
            <path
              key={i}
              d={arc(50, s + 8, s + 82)}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.9"
              strokeDasharray={DASH}
              style={{ ...draw("1.4s", "0.4s"), filter: "drop-shadow(0 0 5px currentColor)" }}
            />
          ))}
        </g>

        {/* 중앙 발광 원 */}
        <circle
          cx="100"
          cy="100"
          r="30"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
          style={{ color: "#eaff00", animation: "summon-glow 2s ease-in-out infinite" }}
        />
      </svg>
    </div>
  );
}

/**
 * 공포 모드 전용 '공포 명소 소환'. 다트 대신, Perplexity가 검색한 "지금도 실존하는"
 * 국내 공포 명소를 소환해 그 지역을 오늘의 목적지로 삼는다. 명소가 나올 때까지 재검색한다.
 */
export default function HorrorSummon({
  onConfirm,
  onClose,
  excludeCityIds = [],
}: {
  onConfirm: (cityId: string, rarity: Rarity, spot: HorrorSpot) => void;
  onClose: () => void;
  /** 이미 갔거나 여행 중인 도시(제외) + 이번 세션에 이미 소환된 곳은 다시 안 나오게 */
  excludeCityIds?: string[];
}) {
  const regions = useKoreaRegions();
  const [phase, setPhase] = useState<Phase>("summoning");
  const [result, setResult] = useState<SpotResult | null>(null);

  // 소환 시퀀스 — 여러 번(이중 마운트/재소환) 호출돼도 "가장 최근" 소환 결과만 반영해서
  // 이미 정해진 장소가 뒤늦게 끝난 옛 소환 결과로 바뀌는 걸 막는다
  const summonSeq = useRef(0);
  // 이번 세션에 이미 보여준 도시(다시 소환 시 중복 방지)
  const shownRef = useRef<Set<string>>(new Set());

  const summon = useCallback(async () => {
    const seq = ++summonSeq.current;
    setPhase("summoning");
    setResult(null);
    // 명소가 나올 때까지 재검색 (지역 매칭 성공한 첫 후보 채택)
    for (let round = 0; round < 3; round++) {
      try {
        const res = await fetch("/api/horror-destination", { method: "POST" });
        const data = await res.json();
        if (summonSeq.current !== seq) return; // 더 최신 소환이 시작됨 → 이 결과는 폐기
        const spots: { name: string; province: string; city: string; description: string }[] =
          data?.spots ?? [];
        const skip = new Set([...excludeCityIds, ...shownRef.current]);
        for (const s of spots) {
          const city = findCityByRegion(s.province, s.city);
          if (city && !skip.has(city.id)) {
            if (summonSeq.current !== seq) return;
            shownRef.current.add(city.id);
            setResult({ city, spot: { name: s.name, description: s.description } });
            setPhase("revealed");
            return;
          }
        }
      } catch {
        // 네트워크 오류 → 다음 라운드에서 재시도
      }
    }
    if (summonSeq.current !== seq) return;
    setPhase("empty");
  }, [excludeCityIds]);

  // 레지스트리(전국 시군구)가 로드된 뒤에 소환 시작 — findCityByRegion에 필요.
  // (의도된 트리거: 소환은 이 시점에 시작한다. 중복 호출은 summonSeq로 안전하게 무시됨)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (regions) summon();
  }, [regions, summon]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 md:items-center">
      <div className="no-scrollbar max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-morgo-navy p-5 pb-[calc(20px+env(safe-area-inset-bottom))] text-white shadow-xl md:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-morgo-yellow">
              🔮 공포 명소 소환
            </h2>
            <p className="mt-0.5 text-sm text-white/55">
              {phase === "summoning" && "지금 실존하는 무서운 곳을 불러오는 중…"}
              {phase === "revealed" && "소환 완료. 오늘 갈 곳은 여기"}
              {phase === "empty" && "흐음… 뭔가 방해가 있었어"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-2.5 py-1 text-sm text-white/60"
          >
            ✕
          </button>
        </div>

        <div className="relative mt-4 grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-2xl bg-black">
          {/* 소환진(마법진) — 그려지며 회전·발광한다. 소환이 끝나면 사라진다 */}
          {phase === "summoning" && <SummoningCircle />}
          <div className="relative z-10 text-center">
            {phase === "revealed" && result ? (
              <div style={{ animation: "summon-flare 700ms ease-out" }}>
                <div className="text-6xl drop-shadow-[0_0_14px_rgba(233,30,99,0.85)]">🪦</div>
                <div className="mt-2 text-[11px] font-bold text-morgo-pink">👻 소환된 곳</div>
                <div className="text-2xl font-extrabold text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.95)]">
                  {cityLabel(result.city)}
                </div>
              </div>
            ) : phase === "summoning" ? (
              <p className="animate-pulse text-sm font-semibold tracking-widest text-morgo-yellow/80 drop-shadow-[0_0_8px_rgba(234,255,0,0.5)]">
                주문 외우는 중…
              </p>
            ) : (
              <p className="text-sm text-white/50">소환 실패</p>
            )}
          </div>
        </div>

        {phase === "revealed" && result ? (
          <div className="mt-4">
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-[11px] text-white/50">☠️ 필수 방문 명소</div>
              <div className="mt-0.5 text-lg font-extrabold text-morgo-yellow">
                🕯️ {result.spot.name}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                {result.spot.description}
              </p>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/45">
              ⚠️ 건물·시설 안에는 절대 들어가지 마세요. 무단진입·폐가 내부는 금지이며,
              밝은 도로변 등 바깥 공개된 곳에서만 인증하세요.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={summon}
                className="min-h-[48px] flex-1 rounded-xl border border-white/25 font-semibold text-white/80"
              >
                😱 다시 소환
              </button>
              <button
                type="button"
                onClick={() => onConfirm(result.city.id, "common", result.spot)}
                className="min-h-[48px] flex-[1.5] rounded-xl bg-morgo-yellow font-extrabold text-morgo-navy"
              >
                🔥 여기로 간다
              </button>
            </div>
          </div>
        ) : phase === "empty" ? (
          <button
            type="button"
            onClick={summon}
            className="mt-4 min-h-[52px] w-full rounded-xl bg-morgo-yellow font-extrabold text-morgo-navy"
          >
            🔮 다시 소환하기
          </button>
        ) : (
          <div className="mt-4 min-h-[52px] w-full content-center rounded-xl bg-white/10 text-center font-bold text-white/50">
            소환 중…
          </div>
        )}
      </div>
    </div>
  );
}
