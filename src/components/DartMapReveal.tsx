"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentEvent, MAP_VIEW, projectKorea } from "@/lib/logic";
import { applyPity, PITY_THRESHOLD, RARITY_LABELS, rollRarity } from "@/lib/rarity";
import { cityLabel, getCityExtra, getThrowablePool } from "@/lib/seed";
import { useKoreaRegions } from "@/lib/useKoreaRegions";
import type { City, Rarity } from "@/lib/types";
import KoreaMap from "./KoreaMap";

type Phase = "ready" | "flying" | "landed" | "ad";

interface Waypoint {
  left: number;
  top: number;
  rotate: number;
  scale: number;
  dur: number;
  ease: string;
}

const AD_SECONDS = 3;
const REROLL_COST = 20; // 포인트로 다시 던질 때 드는 비용
const SUSPENSE_EASE = "cubic-bezier(.3,.6,.35,1)";
const COMMIT_EASE = "cubic-bezier(.25,.7,.3,1.2)";

/** 다트가 던지는 순간 밀당하는 대사 (advance→retreat 반복하다 마지막에 진짜 목적지로 커밋) */
const FLIGHT_LINES = [
  "어? 저기 꽂히나...?",
  "아니 잠깐만...",
  "그럼 여기?!",
  "아니야 진짜 잠깐!!",
  "어어어—!!",
];

const RARITY_META: Record<Rarity, { ring: string; badge: string }> = {
  common: { ring: "bg-morgo-yellow", badge: "" },
  rare: { ring: "bg-morgo-mint", badge: "bg-morgo-mint text-morgo-navy" },
  epic: { ring: "bg-morgo-pink", badge: "bg-morgo-pink text-white" },
  legendary: { ring: "bg-morgo-yellow", badge: "bg-morgo-yellow text-morgo-navy" },
};

function pickFrom(pool: City[], seed: number): City {
  const idx = Math.floor(seed * pool.length) % pool.length;
  return pool[idx];
}

/** 촉(끝)이 정확히 앵커 지점에 닿도록 tip-anchored로 그린 다트 아이콘 */
function DartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 34" width="26" height="36" className={className}>
      <polygon points="12,0 8.5,8 15.5,8" fill="#c7cbd6" />
      <polygon points="12,0 10.3,8 12,8" fill="#9a9fae" />
      <rect x="10.2" y="8" width="3.6" height="13" rx="1.6" fill="#eaff00" />
      <rect x="10.6" y="8" width="1.4" height="13" rx="0.7" fill="#fff7b0" opacity="0.7" />
      <line x1="12" y1="21" x2="12" y2="27" stroke="#0a0a12" strokeWidth="1.6" />
      <path d="M12,25 L4,33 L12,29 L20,33 Z" fill="#e91e63" />
    </svg>
  );
}

/**
 * 다트를 던져서 오늘의 랜덤 목적지를 뽑는 연출. 전국 시군구(서울 제외, 광역시는 구 단위 대신
 * 시 전체로 뭉쳐서)에서 뽑는다. 다트 촉이 실제 도시 좌표(projectKorea)에 정확히 꽂히도록
 * tip-anchored로 애니메이션하고, 다른 곳에 꽂힐 뻔하다 진짜 목적지로 스냅되는 니어미스 +
 * 등급 변동 보상 + 착지 시 그 지역으로 확대되는 연출을 더한다.
 */
export default function DartMapReveal({
  onConfirm,
  onClose,
  pointsAvailable,
  onSpendPoints,
  pityCount,
  onThrowResult,
  horror = false,
}: {
  /** 확정 버튼을 눌렀을 때 최종 선택된 도시 id와 등급 */
  onConfirm: (cityId: string, rarity: Rarity) => void;
  onClose: () => void;
  /** 지금 쓸 수 있는 포인트 잔액 (다시 던지기 비용 판단용) */
  pointsAvailable: number;
  /** 포인트 소모 시도 — 잔액 부족하면 false */
  onSpendPoints: (amount: number) => boolean;
  /** 연속 일반 등급 횟수 (천장 판정용) */
  pityCount: number;
  /** 던지기 착지 시 결과 등급 통보 (천장 카운터 갱신용) */
  onThrowResult: (rarity: Rarity) => void;
  /** 공포 모드 여부 (지도 팔레트에 반영) */
  horror?: boolean;
}) {
  const regions = useKoreaRegions();
  // regions가 로드되면(=registerRegionsAsCities가 끝나면) 전국 뽑기 풀을 가져온다
  const pool = useMemo(() => (regions ? getThrowablePool() : null), [regions]);

  const [phase, setPhase] = useState<Phase>("ready");
  const [flightStep, setFlightStep] = useState(0);
  const [spin, setSpin] = useState(() => ({
    city: Math.random(),
    rarity: Math.random(),
    decoy1: Math.random(),
    decoy2: Math.random(),
  }));
  const [adLeft, setAdLeft] = useState(AD_SECONDS);
  const [showRerollOptions, setShowRerollOptions] = useState(false);

  const target = useMemo(
    () => (pool && pool.length > 0 ? pickFrom(pool, spin.city) : null),
    [pool, spin.city],
  );
  const decoy1 = useMemo(
    () => (pool && pool.length > 1 ? pickFrom(pool, spin.decoy1) : null),
    [pool, spin.decoy1],
  );
  const decoy2 = useMemo(
    () => (pool && pool.length > 1 ? pickFrom(pool, spin.decoy2) : null),
    [pool, spin.decoy2],
  );
  const event = useMemo(() => getCurrentEvent(), []);
  const rarity = useMemo(
    () => applyPity(rollRarity(spin.rarity), pityCount),
    [spin.rarity, pityCount],
  );
  const meta = RARITY_META[rarity];
  const pityLeft = Math.max(0, PITY_THRESHOLD - pityCount);

  const pctOf = (city: City | null) => {
    if (!city) return { left: 50, top: 50 };
    const p = projectKorea(city.officeLatitude, city.officeLongitude);
    return { left: (p.x / MAP_VIEW.w) * 100, top: (p.y / MAP_VIEW.h) * 100 };
  };
  const { left: leftPct, top: topPct } = useMemo(() => pctOf(target), [target]);
  const decoy1Pct = useMemo(() => pctOf(decoy1), [decoy1]);
  const decoy2Pct = useMemo(() => pctOf(decoy2), [decoy2]);

  // 던지면 딴 곳에 꽂힐 것처럼 밀당하다(전진→후퇴 2번) 마지막에 진짜 목적지로 커밋한다
  const waypoints: Waypoint[] = useMemo(
    () => [
      { ...decoy1Pct, rotate: 200, scale: 0.92, dur: 420, ease: SUSPENSE_EASE },
      { left: 50, top: 58, rotate: 150, scale: 0.85, dur: 300, ease: SUSPENSE_EASE },
      { ...decoy2Pct, rotate: 330, scale: 0.94, dur: 420, ease: SUSPENSE_EASE },
      { left: 50, top: 58, rotate: 300, scale: 0.85, dur: 300, ease: SUSPENSE_EASE },
      { left: leftPct, top: topPct, rotate: 460, scale: 1.08, dur: 480, ease: COMMIT_EASE },
    ],
    [decoy1Pct, decoy2Pct, leftPct, topPct],
  );

  const ready = !!pool && !!target;
  const isFlying = phase === "flying";

  const throwDart = () => {
    if (isFlying || !ready) return;
    const landedRarity = rarity; // 이번 판정에 쓸 등급을 던지는 시점에 고정
    setPhase("flying");
    setFlightStep(0);
    let elapsed = 0;
    for (let i = 1; i < waypoints.length; i++) {
      elapsed += waypoints[i - 1].dur;
      window.setTimeout(() => setFlightStep(i), elapsed);
    }
    elapsed += waypoints[waypoints.length - 1].dur;
    window.setTimeout(() => {
      setPhase("landed");
      onThrowResult(landedRarity);
    }, elapsed);
  };

  // 새 스핀 뽑고 바로 다시 던짐 (광고 시청 완료 / 포인트 결제 완료 시 공통으로 씀)
  const rethrow = () => {
    setSpin({
      city: Math.random(),
      rarity: Math.random(),
      decoy1: Math.random(),
      decoy2: Math.random(),
    });
    setShowRerollOptions(false);
    setPhase("ready");
    window.setTimeout(throwDart, 50);
  };

  // "쫄았음, 다시" → 포인트 결제 또는 광고 시청 중 선택
  const openRerollOptions = () => setShowRerollOptions(true);

  const payPointsThenRethrow = () => {
    if (!onSpendPoints(REROLL_COST)) return;
    rethrow();
  };

  // 스킵 불가 광고 시청 → 자동으로 다시 던짐
  const watchAdThenRethrow = () => {
    setAdLeft(AD_SECONDS);
    setPhase("ad");
  };

  useEffect(() => {
    if (phase !== "ad") return;
    const t = window.setInterval(() => {
      setAdLeft((s) => {
        if (s > 1) return s - 1;
        window.clearInterval(t);
        rethrow();
        return AD_SECONDS;
      });
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const dartStyle: React.CSSProperties =
    phase === "ready"
      ? {
          left: "50%",
          top: "-6%",
          transformOrigin: "50% 0%",
          transform: "translate(-50%, 0%) rotate(0deg)",
        }
      : phase === "flying"
        ? (() => {
            const wp = waypoints[flightStep];
            return {
              left: `${wp.left}%`,
              top: `${wp.top}%`,
              transformOrigin: "50% 0%",
              transform: `translate(-50%, 0%) rotate(${wp.rotate}deg) scale(${wp.scale})`,
              transition: `left ${wp.dur}ms ${wp.ease}, top ${wp.dur}ms ${wp.ease}, transform ${wp.dur}ms ${wp.ease}`,
            };
          })()
        : {
            // landed: 마지막 웨이포인트(진짜 목적지)에서 살짝 정착하는 바운스
            left: `${leftPct}%`,
            top: `${topPct}%`,
            transformOrigin: "50% 0%",
            transform: "translate(-50%, 0%) rotate(460deg) scale(1.08)",
            transition: "transform 300ms ease-out",
          };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-morgo-navy/70 md:items-center">
      <div
        className="no-scrollbar max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-morgo-cream p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl"
        style={
          phase === "landed" && rarity === "legendary"
            ? { animation: "dart-legendary-shake 350ms ease-in-out" }
            : undefined
        }
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold">🎯 다트 던지면 그냥 가는 거야</h2>
            <p className="mt-0.5 text-sm text-morgo-navy/55">
              {phase === "ready" && "각오됐어? 후회는 못 해줌"}
              {phase === "flying" && FLIGHT_LINES[flightStep]}
              {phase === "landed" && "명중. 빼도 박도 못해요"}
              {phase === "ad" && "광고 다 봐야 다시 던진다"}
            </p>
          </div>
          {!isFlying && phase !== "ad" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-morgo-card px-2.5 py-1 text-sm text-morgo-navy/50 shadow-sm"
            >
              ✕
            </button>
          )}
        </div>

        {phase === "ready" && event.effect.type === "rarity" && (
          <div className="mt-2 rounded-xl bg-morgo-pink-soft px-3 py-1.5 text-center text-[11px] font-bold text-morgo-navy">
            {event.emoji} {event.title} 진행 중 · {event.reward}
          </div>
        )}
        {phase === "ready" && pityCount > 0 && (
          <div className="mt-2 text-center text-[11px] font-semibold text-morgo-navy/45">
            {pityLeft > 0
              ? `연속 일반 ${pityCount}번 · ${pityLeft}번 안에 레어 확정 🎯`
              : "다음 던지기 레어 이상 확정! 🎯"}
          </div>
        )}

        <div
          className="relative mt-4 overflow-hidden rounded-2xl bg-morgo-card p-2"
          style={{ aspectRatio: `${MAP_VIEW.w} / ${MAP_VIEW.h}` }}
        >
          {regions && target ? (
            // 지도 + 링 + 다트: 착지 시 이 그룹 전체가 당첨 지역으로 확대됨
            <div
              className="h-full w-full transition-transform duration-[900ms] ease-out"
              style={{
                transformOrigin: `${leftPct}% ${topPct}%`,
                transform: phase === "landed" ? "scale(2.3)" : "scale(1)",
              }}
            >
              <KoreaMap
                regions={regions}
                records={{}}
                activeCode={phase === "landed" ? target.code : undefined}
                onSelect={() => {}}
                horror={horror}
              />
              {phase === "landed" && (
                <>
                  <span
                    key={`${target.id}-ring1`}
                    className={`pointer-events-none absolute h-10 w-10 rounded-full ${meta.ring}`}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      animation: "dart-impact-ring 700ms ease-out forwards",
                    }}
                  />
                  {rarity !== "common" && (
                    <span
                      key={`${target.id}-ring2`}
                      className={`pointer-events-none absolute h-10 w-10 rounded-full ${meta.ring}`}
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        animation: "dart-impact-ring 1000ms 150ms ease-out forwards",
                      }}
                    />
                  )}
                </>
              )}
              <div
                className={`pointer-events-none absolute drop-shadow-md ${
                  phase === "ready" ? "animate-bounce" : ""
                }`}
                style={dartStyle}
              >
                <DartIcon />
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center text-sm text-morgo-navy/40">
              지도를 불러오는 중…
            </div>
          )}
        </div>

        {phase === "ad" ? (
          <div className="mt-4 rounded-2xl bg-black p-6 text-center text-white">
            <div className="text-[11px] font-bold uppercase tracking-wide text-white/40">
              광고
            </div>
            <div className="mt-2 text-4xl">📺</div>
            <p className="mt-2 text-sm text-white/70">
              쫄았으면 광고 하나는 봐야지
            </p>
            <div className="mt-3 text-3xl font-extrabold text-morgo-yellow">
              {adLeft}
            </div>
          </div>
        ) : phase === "landed" && target ? (
          <div className="mt-4">
            <div className="rounded-2xl bg-morgo-navy p-4 text-center text-white">
              {rarity !== "common" && (
                <div
                  className={`mb-1.5 inline-block rounded-full px-2.5 py-1 text-xs font-extrabold ${meta.badge}`}
                >
                  {RARITY_LABELS[rarity]} 당첨!
                </div>
              )}
              <div className="text-xs text-morgo-yellow">당첨된 곳</div>
              <div className="mt-1 text-xl font-extrabold">{cityLabel(target)}</div>
            </div>

            {(() => {
              const extra = getCityExtra(target.id);
              if (!extra) return null;
              return (
                <div className="mt-3 rounded-2xl bg-morgo-yellow-soft p-4 text-left">
                  <div className="text-xs font-bold text-morgo-navy/60">
                    🔥 여기 가서 이건 무조건 해
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-morgo-navy shadow-sm">
                      {extra.landmarkEmoji} {extra.landmark}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-morgo-navy shadow-sm">
                      🍽️ {extra.food}
                    </span>
                  </div>
                </div>
              );
            })()}

            {(rarity === "epic" || rarity === "legendary") && (
              <div className="mt-3 rounded-2xl bg-morgo-navy p-3 text-center text-xs font-bold text-morgo-yellow">
                🎁 보너스 미션 하나 더 추가됨 (포인트 실지급)
              </div>
            )}

            {showRerollOptions ? (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={payPointsThenRethrow}
                  disabled={pointsAvailable < REROLL_COST}
                  className="min-h-[48px] w-full rounded-xl border border-morgo-navy/20 font-semibold text-morgo-navy/70 disabled:opacity-40"
                >
                  🪙 포인트 {REROLL_COST}개 쓰고 바로 다시 ({pointsAvailable}P 보유)
                </button>
                <button
                  type="button"
                  onClick={watchAdThenRethrow}
                  className="min-h-[48px] w-full rounded-xl border border-morgo-navy/20 font-semibold text-morgo-navy/70"
                >
                  📺 광고 보고 무료로 다시
                </button>
                <button
                  type="button"
                  onClick={() => setShowRerollOptions(false)}
                  className="w-full py-1 text-xs text-morgo-navy/40"
                >
                  ← 안 할래
                </button>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={openRerollOptions}
                  className="min-h-[48px] flex-1 rounded-xl border border-morgo-navy/20 font-semibold text-morgo-navy/70"
                >
                  😨 쫄았음, 다시
                </button>
                <button
                  type="button"
                  onClick={() => onConfirm(target.id, rarity)}
                  className="min-h-[48px] flex-[1.5] rounded-xl bg-morgo-navy font-extrabold text-white"
                >
                  🔥 그냥 간다
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={throwDart}
            disabled={isFlying || !ready}
            className="mt-4 min-h-[52px] w-full rounded-xl bg-morgo-yellow font-extrabold text-morgo-navy disabled:opacity-60"
          >
            {isFlying ? "날아가는 중… 못 멈춤" : ready ? "🎯 던진다 간다" : "지도를 불러오는 중…"}
          </button>
        )}
      </div>
    </div>
  );
}
