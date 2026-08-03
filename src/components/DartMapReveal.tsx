"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

interface Vec {
  x: number;
  y: number;
}

const AD_SECONDS = 3;
const REROLL_COST = 20; // 포인트로 다시 던질 때 드는 비용
const SUSPENSE_EASE = "cubic-bezier(.3,.6,.35,1)";
const COMMIT_EASE = "cubic-bezier(.25,.7,.3,1.2)";
const LAUNCH_EASE = "cubic-bezier(.2,.8,.3,1)";

// 새총식 조준 — 다트가 놓여있는 발사대(지도 하단 중앙)와 당기기/퍼펙트 파라미터
const ANCHOR = { left: 50, top: 88 };
const MAX_PULL_PCT = 52; // 이 거리만큼 당기면 파워 100%
const MIN_PULL = 0.12; // 이보다 덜 당기면 던지지 않고 스냅백
const PERFECT_MIN = 0.7; // 퍼펙트 존 (파워 비율)
const PERFECT_MAX = 0.92;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* 미지원 브라우저 무시 */
  }
}

// 착지 순간 "턱!" 꽂히는 타격음 — 별도 음원 없이 WebAudio 오실레이터로 짧게 낸다
let audioCtx: AudioContext | null = null;
function playThunk(strong: boolean) {
  try {
    if (typeof window === "undefined") return;
    const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AC = w.AudioContext || w.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    const ctx = audioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(strong ? 190 : 150, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(strong ? 0.5 : 0.32, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.24);
  } catch {
    /* 오디오 정책상 막히면 무시 */
  }
}

/** 다트가 날아가는 동안 밀당하는 대사 (발사→니어미스 반복하다 마지막에 진짜 목적지로 커밋) */
const FLIGHT_LINES = [
  "가랏—!",
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
 * 다트를 던져서 오늘의 랜덤 목적지를 뽑는 연출. 전국 시군구(서울 제외, 광역시는 시 전체로 뭉쳐서)에서 뽑는다.
 * 조작: 지도 하단 발사대에서 다트를 손가락으로 당겼다 놓는 "새총식" 던지기.
 *   - 당긴 거리 = 파워, 당긴 반대 방향 = 발사 방향 (조준하는 손맛)
 *   - 파워가 퍼펙트 존일 때 놓으면 ✨퍼펙트 명중 연출 (등급/목적지엔 영향 없음 — 연출만)
 *   - 착지 시 진동 + 타격음 + 화면 흔들림 + 잔상으로 꽂히는 타격감
 * 목적지·등급은 던지기 전에 이미 정해져 있고(spin+천장), 니어미스 애니메이션 뒤 그 도시에 정확히 꽂힌다.
 */
export default function DartMapReveal({
  onConfirm,
  onClose,
  pointsAvailable,
  onSpendPoints,
  pityCount,
  onThrowResult,
  horror = false,
  excludeCityIds = [],
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
  /** 이미 갔거나 여행 중인 도시(제외) — 다시 뽑히지 않게 */
  excludeCityIds?: string[];
}) {
  const regions = useKoreaRegions();
  // regions가 로드되면(=registerRegionsAsCities가 끝나면) 전국 뽑기 풀을 가져온다.
  // 방문/여행 중인 도시는 풀에서 제외한다(전부 제외되면 안전하게 전체 풀로 폴백).
  const pool = useMemo(() => {
    if (!regions) return null;
    const all = getThrowablePool();
    const exclude = new Set(excludeCityIds);
    const filtered = all.filter((c) => !exclude.has(c.id));
    return filtered.length > 0 ? filtered : all;
  }, [regions, excludeCityIds]);

  const [phase, setPhase] = useState<Phase>("ready");
  const [flightStep, setFlightStep] = useState(0);
  const [flightPath, setFlightPath] = useState<Waypoint[]>([]);
  const [spin, setSpin] = useState(() => ({
    city: Math.random(),
    rarity: Math.random(),
    decoy1: Math.random(),
    decoy2: Math.random(),
  }));
  const [adLeft, setAdLeft] = useState(AD_SECONDS);
  const [showRerollOptions, setShowRerollOptions] = useState(false);
  const [power, setPower] = useState(1); // 착지 스케일에 반영될, 놓는 순간 고정된 세기
  const [landedPerfect, setLandedPerfect] = useState(false);
  // 새총 당기기 상태 (앵커 기준 당긴 벡터, %단위). null이면 안 당기는 중
  const [drag, setDrag] = useState<Vec | null>(null);
  const draggingRef = useRef(false);
  const dragRef = useRef<Vec | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

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

  // 날아가면 딴 곳에 꽂힐 것처럼 밀당하다(전진→후퇴 2번) 마지막에 진짜 목적지로 커밋한다
  const baseWaypoints: Waypoint[] = useMemo(
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

  // 발사 방향(aim)으로 튀어나가는 런치 웨이포인트를 앞에 붙여 실제 조준감을 살린다
  const buildPath = (aim: Vec): Waypoint[] => {
    const launch: Waypoint = {
      left: clamp(ANCHOR.left + aim.x * 34, 4, 96),
      top: clamp(ANCHOR.top + aim.y * 34, 4, 96),
      rotate: (Math.atan2(aim.x, -aim.y) * 180) / Math.PI,
      scale: 1.06,
      dur: 240,
      ease: LAUNCH_EASE,
    };
    return [launch, ...baseWaypoints];
  };

  const throwDart = (aim: Vec = { x: 0, y: -1 }, perfect = false, landedRarity = rarity) => {
    if (isFlying || !ready) return;
    const path = buildPath(aim);
    setFlightPath(path);
    setPhase("flying");
    setFlightStep(0);
    let elapsed = 0;
    for (let i = 1; i < path.length; i++) {
      elapsed += path[i - 1].dur;
      window.setTimeout(() => setFlightStep(i), elapsed);
    }
    elapsed += path[path.length - 1].dur;
    window.setTimeout(() => {
      setPhase("landed");
      onThrowResult(landedRarity);
      // 타격감: 진동 + 타격음 (등급/퍼펙트일수록 세게)
      vibrate(landedRarity === "legendary" ? [40, 40, 90] : perfect ? [30, 20, 60] : [22]);
      playThunk(perfect || landedRarity !== "common");
    }, elapsed);
  };

  // ── 새총 당기기 포인터 핸들러 ───────────────────────────────
  const toPct = (e: React.PointerEvent): Vec => {
    const el = mapRef.current;
    if (!el) return { x: ANCHOR.left, y: ANCHOR.top };
    const r = el.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    };
  };

  const onMapPointerDown = (e: React.PointerEvent) => {
    if (phase !== "ready" || !ready) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    const p = toPct(e);
    const pull = { x: p.x - ANCHOR.left, y: p.y - ANCHOR.top };
    dragRef.current = pull;
    setDrag(pull);
  };

  const onMapPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const p = toPct(e);
    const pull = { x: p.x - ANCHOR.left, y: p.y - ANCHOR.top };
    dragRef.current = pull;
    setDrag(pull);
  };

  const onMapPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const pull = dragRef.current ?? { x: 0, y: 0 };
    dragRef.current = null;
    setDrag(null);
    const len = Math.hypot(pull.x, pull.y);
    const pw = Math.min(1, len / MAX_PULL_PCT);
    if (pw < MIN_PULL) return; // 너무 살짝 당김 → 스냅백, 던지지 않음
    const aim: Vec = len > 0 ? { x: -pull.x / len, y: -pull.y / len } : { x: 0, y: -1 };
    const perfect = pw >= PERFECT_MIN && pw <= PERFECT_MAX;
    setPower(0.6 + pw * 0.5);
    setLandedPerfect(perfect);
    vibrate(perfect ? [16] : [10]); // 릴리스 톡
    throwDart(aim, perfect, rarity);
  };

  // 새 스핀 뽑고 바로 다시 던짐 (광고 시청 완료 / 포인트 결제 완료 시 공통으로 씀)
  const rethrow = () => {
    setSpin({
      city: Math.random(),
      rarity: Math.random(),
      decoy1: Math.random(),
      decoy2: Math.random(),
    });
    setLandedPerfect(false);
    setShowRerollOptions(false);
    setPhase("ready");
    window.setTimeout(() => throwDart(), 50);
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

  // ── 조준 파생값 (렌더용) ─────────────────────────────────────
  const powerNow = drag ? Math.min(1, Math.hypot(drag.x, drag.y) / MAX_PULL_PCT) : 0;
  const perfectNow = powerNow >= PERFECT_MIN && powerNow <= PERFECT_MAX;
  const aimNow: Vec = drag
    ? (() => {
        const l = Math.hypot(drag.x, drag.y) || 1;
        return { x: -drag.x / l, y: -drag.y / l };
      })()
    : { x: 0, y: -1 };
  const fingerX = clamp(ANCHOR.left + (drag?.x ?? 0), 0, 100);
  const fingerY = clamp(ANCHOR.top + (drag?.y ?? 0), 0, 100);
  const guideLen = 18 + powerNow * 55;
  const aimEndX = clamp(ANCHOR.left + aimNow.x * guideLen, 0, 100);
  const aimEndY = clamp(ANCHOR.top + aimNow.y * guideLen, 0, 100);

  const dartStyle: React.CSSProperties =
    phase === "ready"
      ? {
          // 발사대 위: 안 당길 땐 위를 보고 대기, 당기면 발사 방향으로 조준(꽁무니 기준 회전)
          left: `${ANCHOR.left + (drag ? drag.x * 0.3 : 0)}%`,
          top: `${ANCHOR.top + (drag ? drag.y * 0.3 : 0)}%`,
          transformOrigin: "50% 100%",
          transform: `translate(-50%, -100%) rotate(${
            drag ? (Math.atan2(aimNow.x, -aimNow.y) * 180) / Math.PI : 0
          }deg) scale(${drag ? 1.12 : 1})`,
          transition: drag ? "none" : "transform 120ms ease-out",
        }
      : phase === "flying"
        ? (() => {
            const wp = flightPath[flightStep] ?? flightPath[0];
            if (!wp) return {};
            return {
              left: `${wp.left}%`,
              top: `${wp.top}%`,
              transformOrigin: "50% 0%",
              transform: `translate(-50%, 0%) rotate(${wp.rotate}deg) scale(${wp.scale})`,
              transition: `left ${wp.dur}ms ${wp.ease}, top ${wp.dur}ms ${wp.ease}, transform ${wp.dur}ms ${wp.ease}`,
            };
          })()
        : {
            // landed: 진짜 목적지에 꽂혀 정착 (파워가 셀수록 크게 박힘)
            left: `${leftPct}%`,
            top: `${topPct}%`,
            transformOrigin: "50% 0%",
            transform: `translate(-50%, 0%) rotate(460deg) scale(${(0.95 + power * 0.2).toFixed(3)})`,
            transition: "transform 300ms ease-out",
          };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-morgo-navy/70 md:items-center">
      <div
        className="no-scrollbar max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-morgo-cream p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl"
        style={
          phase === "landed"
            ? {
                animation:
                  rarity === "legendary" || landedPerfect
                    ? "dart-legendary-shake 350ms ease-in-out"
                    : "dart-hit-shake 220ms ease-out",
              }
            : undefined
        }
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold">🎯 다트 던지면 그냥 가는 거야</h2>
            <p className="mt-0.5 text-sm text-morgo-navy/55">
              {phase === "ready" &&
                (drag
                  ? perfectNow
                    ? "✨ 퍼펙트 존! 지금 놔!"
                    : "당긴 방향으로 발사 — 세게 당길수록 강하게"
                  : "다트를 당겼다 놓아 오늘 목적지 결정")}
              {phase === "flying" && FLIGHT_LINES[Math.min(flightStep, FLIGHT_LINES.length - 1)]}
              {phase === "landed" && (landedPerfect ? "✨ 퍼펙트 명중! 여기로 갑니다" : "명중! 오늘은 여기로 갑니다")}
              {phase === "ad" && "광고 보고 나면 다시 던질 수 있어요"}
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
          ref={mapRef}
          onPointerDown={onMapPointerDown}
          onPointerMove={onMapPointerMove}
          onPointerUp={onMapPointerUp}
          onPointerCancel={onMapPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          className="relative mt-4 select-none overflow-hidden rounded-2xl bg-morgo-card p-2"
          style={{
            aspectRatio: `${MAP_VIEW.w} / ${MAP_VIEW.h}`,
            touchAction: phase === "ready" ? "none" : undefined,
            cursor: phase === "ready" && ready ? "grab" : "default",
          }}
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

              {/* 조준 가이드 — 당기는 중에만: 고무줄(핑크) + 발사선(퍼펙트면 초록) */}
              {phase === "ready" && drag && (
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <line
                    x1={ANCHOR.left}
                    y1={ANCHOR.top}
                    x2={fingerX}
                    y2={fingerY}
                    stroke="#e91e63"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    opacity="0.65"
                  />
                  <line
                    x1={ANCHOR.left}
                    y1={ANCHOR.top}
                    x2={aimEndX}
                    y2={aimEndY}
                    stroke={perfectNow ? "#22c55e" : "#eab308"}
                    strokeWidth="2"
                    strokeDasharray="3 3"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={aimEndX}
                    cy={aimEndY}
                    r="2.4"
                    fill={perfectNow ? "#22c55e" : "#eab308"}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}

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
                  {(rarity !== "common" || landedPerfect) && (
                    <span
                      key={`${target.id}-ring2`}
                      className={`pointer-events-none absolute h-10 w-10 rounded-full ${
                        landedPerfect ? "bg-green-400" : meta.ring
                      }`}
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        animation: "dart-impact-ring 1000ms 150ms ease-out forwards",
                      }}
                    />
                  )}
                </>
              )}

              {/* 날아가는 잔상 — 지나온 웨이포인트에 흐릿한 다트 (타격감) */}
              {phase === "flying" &&
                flightPath.slice(Math.max(0, flightStep - 2), flightStep).map((wp, i) => (
                  <div
                    key={`trail-${flightStep}-${i}`}
                    className="pointer-events-none absolute"
                    style={{
                      left: `${wp.left}%`,
                      top: `${wp.top}%`,
                      transformOrigin: "50% 0%",
                      transform: `translate(-50%, 0%) rotate(${wp.rotate}deg) scale(${wp.scale * 0.9})`,
                      opacity: 0.1 + 0.08 * i,
                    }}
                  >
                    <DartIcon />
                  </div>
                ))}

              <div
                className={`pointer-events-none absolute drop-shadow-md ${
                  phase === "ready" && !drag ? "animate-bounce" : ""
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
            <div className="text-[11px] font-bold uppercase tracking-wide text-white/40">광고</div>
            <div className="mt-2 text-4xl">📺</div>
            <p className="mt-2 text-sm text-white/70">다시 던지려면 광고 하나만 보고 가요</p>
            <div className="mt-3 text-3xl font-extrabold text-morgo-yellow">{adLeft}</div>
          </div>
        ) : phase === "landed" && target ? (
          <div className="mt-4">
            <div className="rounded-2xl bg-morgo-navy p-4 text-center text-white">
              {landedPerfect && (
                <div className="mb-1.5 inline-block rounded-full bg-green-400 px-2.5 py-1 text-xs font-extrabold text-morgo-navy">
                  ✨ 퍼펙트 명중
                </div>
              )}
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
                  🔥 여기로 간다
                </button>
              </div>
            )}
          </div>
        ) : isFlying ? (
          <div className="mt-4 min-h-[52px] content-center rounded-xl bg-morgo-card text-center font-bold text-morgo-navy/50">
            다트 날아가는 중…
          </div>
        ) : (
          // ready: 파워 미터 + 퍼펙트 존 표시 (실제 던지기는 지도에서 당겼다 놓기)
          <div className="mt-4">
            <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-morgo-navy/10">
              <span
                aria-hidden
                className="absolute inset-y-0 border-x-2 border-green-500/50 bg-green-400/30"
                style={{
                  left: `${PERFECT_MIN * 100}%`,
                  width: `${(PERFECT_MAX - PERFECT_MIN) * 100}%`,
                }}
              />
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 ${perfectNow ? "bg-green-500" : "bg-morgo-pink"}`}
                style={{ width: `${powerNow * 100}%`, transition: drag ? "none" : "width 150ms ease-out" }}
              />
            </div>
            <p className="mt-2 text-center text-sm font-bold text-morgo-navy/70">
              {!ready
                ? "지도를 불러오는 중…"
                : drag
                  ? perfectNow
                    ? "✨ 퍼펙트 존! 지금 놓으면 완벽 명중"
                    : `파워 ${Math.round(powerNow * 100)}%`
                  : "🎯 지도에서 다트를 당겼다 놓아 던지기"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
