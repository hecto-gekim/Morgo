"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CITIES,
  cityLabel,
  findCityByRegion,
  getCityExtra,
} from "@/lib/seed";
import { MAP_VIEW, projectKorea } from "@/lib/logic";
import { useKoreaRegions } from "@/lib/useKoreaRegions";
import type { City, PlaceSpot, Rarity, TripTheme } from "@/lib/types";
import KoreaMap from "./KoreaMap";
import type { Region } from "./KoreaMap";

type Phase = "idle" | "loading" | "revealed";
type PlannedTheme = Extract<TripTheme, "parents" | "baby">;

interface SpotResult {
  city: City;
  spot: PlaceSpot;
}

const COPY: Record<PlannedTheme, { emoji: string; title: string }> = {
  parents: { emoji: "🧡", title: "부모님과 갈 곳 찾기" },
  baby: { emoji: "🍼", title: "아이와 갈 곳 찾기" },
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* 미지원 브라우저 무시 */
  }
}

// ── 부모: 벚꽃잎을 입김으로 불어 날리는 지도 ─────────────────────
// 입술을 누르고 있는 동안 바람이 계속 불어 꽃잎이 흐르듯 연속으로 쓸려나간다.
// (모았다 놓기 X — "반은 날아가고 반은 멈춰 있는" 어색한 정지 화면이 안 생긴다)
const PETAL_COUNT = 90;
const BLOW_CAP = 0.78; // 목적지가 정해지기 전엔 이 이상 안 날아간다 — 마지막 꽃잎은 결과와 함께
const ZOOM_SCALE = 2.4;
const WIND_TICK_MS = 50;
const WIND_RAMP = 0.045; // 누르고 ~1.1초면 바람 최대 세기
const BLOW_MIN = 0.01; // 약한 바람일 때 틱당 날아가는 비율
const BLOW_MAX = 0.03; // 최대 바람일 때 — 꾹 누르고 있으면 ~2.5초에 전부

/** 결정적 의사난수 — SSR/재렌더에도 꽃잎 배치가 흔들리지 않는다 */
function prand(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// 이모지(통꽃)가 아니라 CSS로 그린 꽃잎 '조각' — 진한 벚꽃 핑크 그라데이션 + 초록 잎사귀
const PETAL_TONES: [string, string][] = [
  ["#ffb7d3", "#ff6da8"],
  ["#ffa8c9", "#f65f9e"],
  ["#ff9ec6", "#ee4d90"],
  ["#ffc4da", "#ff7fb0"],
];
const LEAF_TONES: [string, string][] = [
  ["#c9ecb4", "#7fc96a"],
  ["#b7e6a0", "#6bbd57"],
];

interface Petal {
  leaf: boolean;
  grad: string;
  left: number; // %
  top: number; // %
  w: number; // px
  h: number; // px
  baseRot: number; // 놓인 각도
  threshold: number; // 누적 바람이 이 값을 넘으면 날아간다 — 입술 쪽(오른쪽)이 먼저
  dx: number; // 날아갈 거리(px, 입술 반대 방향 = 왼쪽)
  dy: number;
  spin: number; // 날아가며 도는 각도
  dur: number;
  delay: number;
  swayDur: number;
  swayDelay: number;
}

function makePetals(): Petal[] {
  return Array.from({ length: PETAL_COUNT }, (_, i) => {
    const leaf = prand(i, 1) < 0.22;
    const tones = leaf ? LEAF_TONES : PETAL_TONES;
    const [c1, c2] = tones[Math.floor(prand(i, 14) * tones.length) % tones.length];
    const left = 1 + prand(i, 2) * 94;
    const w = 9 + prand(i, 4) * 9;
    return {
      leaf,
      grad: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
      left,
      top: 1 + prand(i, 3) * 94,
      w,
      h: w * (leaf ? 1.15 : 1.35),
      baseRot: prand(i, 15) * 360,
      // 바람이 오른쪽(입술)에서 부니까 오른쪽 꽃잎부터 흐르듯 쓸려나간다
      threshold: ((94 - left) / 92) * 0.55 + prand(i, 5) * 0.45,
      dx: -(280 + prand(i, 6) * 300),
      dy: (prand(i, 7) - 0.5) * 140,
      spin: -(360 + prand(i, 8) * 560),
      dur: 900 + prand(i, 9) * 600,
      delay: prand(i, 10) * 160,
      swayDur: 2.2 + prand(i, 11) * 2.2,
      swayDelay: prand(i, 12) * 2,
    };
  });
}

/**
 * 벚꽃잎·나뭇잎이 지도를 가리고 있고, 옆의 입술 버튼을 꾹 누르면 바람이 모인다.
 * (첫 누름에 목적지 AI를 미리 부른다) 놓으면 모은 세기만큼 꽃잎이 후— 날아가고,
 * 다 날아가면 당첨 지역이 확대되며 "여기로 가야 해요!" — 핀 마커는 없다.
 */
function WindPetalMap({
  regions,
  targetCode,
  targetPct,
  cityName,
  revealed,
  onStart,
  onCleared,
}: {
  regions: Region[];
  /** 당첨 지역 코드 (확대 시 하이라이트용) */
  targetCode?: string;
  /** 당첨 지역의 지도상 위치(%) — 확대 기준점 */
  targetPct: { left: number; top: number } | null;
  cityName: string | null;
  /** 목적지 API가 끝났는지 */
  revealed: boolean;
  /** 처음 입김을 모으기 시작한 순간 (목적지 API를 미리 부르는 타이밍) */
  onStart: () => void;
  /** 꽃잎을 전부 날렸을 때 */
  onCleared: () => void;
}) {
  const petals = useMemo(() => makePetals(), []);
  const [holding, setHolding] = useState(false);
  const [wind, setWind] = useState(0); // 지금 부는 바람 세기 — 누르고 있는 동안 차오른다
  const [blownRatio, setBlownRatio] = useState(0);
  const [cleared, setCleared] = useState(false);
  const windRef = useRef(0);
  const ratioRef = useRef(0);
  const revealedRef = useRef(revealed);
  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);
  const tickTimer = useRef<number | null>(null);
  const clearNotified = useRef(false);

  useEffect(
    () => () => {
      if (tickTimer.current) window.clearInterval(tickTimer.current);
    },
    [],
  );

  // 마지막 꽃잎까지 전부 날리고 확대로 넘어간다 (한 번만)
  const finishClear = useCallback(() => {
    if (clearNotified.current) return;
    clearNotified.current = true;
    ratioRef.current = 1;
    setBlownRatio(1);
    vibrate([8, 20, 34]);
    window.setTimeout(() => {
      setCleared(true);
      onCleared();
    }, 1000);
  }, [onCleared]);

  const stopWind = () => {
    if (tickTimer.current) window.clearInterval(tickTimer.current);
    tickTimer.current = null;
    setHolding(false);
    windRef.current = 0;
    setWind(0);
  };

  const startHold = (e: React.PointerEvent) => {
    if (cleared || holding || clearNotified.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onStart();
    setHolding(true);
    vibrate(6);
    // 누르는 동안 바람이 점점 세지며 꽃잎이 연속으로 쓸려나간다.
    // 목적지가 아직이면 BLOW_CAP에서 멈춘다 — 마지막 꽃잎은 결과가 정해지는 순간 날아간다
    tickTimer.current = window.setInterval(() => {
      windRef.current = Math.min(1, windRef.current + WIND_RAMP);
      setWind(windRef.current);
      const cap = revealedRef.current ? 1 : BLOW_CAP;
      const next = Math.min(
        cap,
        ratioRef.current + BLOW_MIN + windRef.current * (BLOW_MAX - BLOW_MIN),
      );
      if (next !== ratioRef.current) {
        ratioRef.current = next;
        setBlownRatio(next);
      }
      if (next >= 1) {
        stopWind();
        finishClear();
      }
    }, WIND_TICK_MS);
  };

  // 결과가 정해지는 순간, 이미 끝까지 분 상태면 남은 꽃잎이 저절로 마저 날아간다
  useEffect(() => {
    if (!revealed || blownRatio < BLOW_CAP) return;
    finishClear();
  }, [revealed, blownRatio, finishClear]);

  const zoomed = cleared && revealed && !!targetPct;
  const windFull = wind >= 0.98;

  return (
    <div className="flex items-center justify-center gap-3">
      {/* 지도 + 꽃잎 */}
      <div className="relative w-56 select-none overflow-hidden rounded-2xl bg-morgo-card">
        <div
          className="relative transition-transform duration-[1100ms]"
          style={{
            transitionTimingFunction: "cubic-bezier(.22,.75,.25,1)",
            transformOrigin: targetPct ? `${targetPct.left}% ${targetPct.top}%` : "50% 50%",
            transform: zoomed ? `scale(${ZOOM_SCALE})` : "scale(1)",
          }}
        >
          <KoreaMap
            regions={regions}
            records={{}}
            activeCode={zoomed ? targetCode : undefined}
            onSelect={() => {}}
          />
          {/* 당첨 지역 글로우 — 핀 대신 봄빛이 은은하게 맥동한다 */}
          {zoomed && targetPct && (
            <span
              aria-hidden
              className="absolute h-10 w-10 rounded-full bg-[radial-gradient(circle,rgba(255,109,168,0.5)_0%,rgba(255,109,168,0.18)_55%,transparent_75%)]"
              style={{
                left: `${targetPct.left}%`,
                top: `${targetPct.top}%`,
                animation: "aura-pulse 1.8s ease-in-out infinite",
              }}
            />
          )}
        </div>

        {/* 봄 안개 — 꽃잎이 날아갈수록 걷히며 지도가 드러난다 */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-pink-200 via-rose-100 to-emerald-100 transition-opacity duration-700"
          style={{ opacity: (1 - blownRatio) * 0.92 }}
        />

        {/* 꽃잎·나뭇잎 조각 — 바깥 span은 위치/비행, 안쪽 span은 꽃잎 모양 */}
        {petals.map((p, i) => {
          const blown = p.threshold <= blownRatio;
          return (
            <span
              key={i}
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                ...(blown
                  ? ({
                      "--bx": `${p.dx.toFixed(0)}px`,
                      "--by": `${p.dy.toFixed(0)}px`,
                      "--spin": `${p.spin.toFixed(0)}deg`,
                      animation: `petal-blow ${p.dur.toFixed(0)}ms cubic-bezier(.3,.5,.4,1) ${p.delay.toFixed(0)}ms both`,
                    } as React.CSSProperties)
                  : {
                      animation: holding
                        ? `petal-tremble ${(0.2 + prand(i, 13) * 0.15).toFixed(2)}s ease-in-out infinite`
                        : `petal-sway ${p.swayDur.toFixed(2)}s ease-in-out ${p.swayDelay.toFixed(2)}s infinite alternate`,
                    }),
              }}
            >
              <span
                className="block"
                style={{
                  width: p.w,
                  height: p.h,
                  background: p.grad,
                  borderRadius: p.leaf ? "80% 10% 80% 10%" : "100% 6% 100% 6%",
                  transform: `rotate(${p.baseRot.toFixed(0)}deg)`,
                  boxShadow: "0 1px 2px rgba(120,40,80,0.15)",
                }}
              />
            </span>
          );
        })}

        {/* 바람 줄기 — 부는 동안 오른쪽(입술)에서 왼쪽으로 계속 훑고 지나간다 */}
        {holding && !cleared && (
          <div className="pointer-events-none absolute inset-0">
            {[16, 36, 56, 76].map((top, i) => (
              <span
                key={i}
                className="absolute right-0 h-0.5 w-12 rounded-full bg-white/70 blur-[1px]"
                style={{
                  top: `${top}%`,
                  animation: `gust-sweep ${700 + i * 160}ms ease-out ${i * 180}ms infinite`,
                }}
              />
            ))}
          </div>
        )}

        {/* 다 불고 난 뒤 — 벚꽃잎이 위에서 잔잔히 흩날리며 마무리 */}
        {cleared && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {petals.slice(0, 12).map((p, i) => (
              <span
                key={`fall-${i}`}
                aria-hidden
                className="absolute"
                style={{
                  left: `${((i * 8.3 + prand(i, 16) * 6) % 96).toFixed(1)}%`,
                  top: "-6%",
                  "--sway": `${((prand(i, 17) - 0.5) * 44).toFixed(0)}px`,
                  animation: `petal-fall ${(3.4 + prand(i, 18) * 2.6).toFixed(2)}s linear ${(prand(i, 19) * 3).toFixed(2)}s infinite`,
                } as React.CSSProperties}
              >
                <span
                  className="block"
                  style={{
                    width: p.w * 0.8,
                    height: p.h * 0.8,
                    background: p.grad,
                    borderRadius: p.leaf ? "80% 10% 80% 10%" : "100% 6% 100% 6%",
                    transform: `rotate(${p.baseRot.toFixed(0)}deg)`,
                  }}
                />
              </span>
            ))}
          </div>
        )}

        {/* 안내 — 아직 한 번도 안 불었을 때 */}
        {blownRatio === 0 && !holding && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-white/85 px-3 py-2 text-center text-[11px] font-bold text-morgo-navy/70 shadow-sm">
            🌸 꽃잎이 지도를 덮고 있어요
            <br />옆 입술을 꾹 누르고 있으면 후— 바람이 불어요
          </div>
        )}

        {/* 다 불었는데 아직 바람(AI)이 목적지를 정하는 중 — 마지막 꽃잎이 버티고 있다 */}
        {blownRatio >= BLOW_CAP && !zoomed && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-full bg-morgo-navy/85 px-3 py-1.5 text-center text-xs font-bold text-white">
            💨 바람이 갈 곳을 정하는 중…
          </div>
        )}

        {/* 확대 완료 — 핀 없이 지역 하이라이트 + 문구로만 알려준다 */}
        {zoomed && cityName && (
          <div
            className="pointer-events-none absolute inset-x-3 bottom-3 rounded-full bg-gradient-to-r from-[#f65f9e] to-[#ff8bb8] px-3 py-1.5 text-center text-sm font-extrabold text-white shadow-lg"
            style={{ animation: "gacha-pop 500ms ease-out" }}
          >
            🌸 여기로 가야 해요! · {cityName}
          </div>
        )}
      </div>

      {/* 입술 버튼 + 바람 게이지 */}
      <div className="flex w-16 flex-col items-center gap-2">
        <div className="relative h-28 w-3 overflow-hidden rounded-full bg-morgo-navy/10">
          <span
            aria-hidden
            className={`absolute inset-x-0 bottom-0 rounded-full ${
              windFull ? "bg-morgo-mint" : "bg-morgo-pink"
            }`}
            style={{
              height: `${wind * 100}%`,
              transition: holding ? "none" : "height 200ms ease-out",
            }}
          />
        </div>
        <button
          type="button"
          disabled={cleared}
          onPointerDown={startHold}
          onPointerUp={stopWind}
          onPointerCancel={stopWind}
          onContextMenu={(e) => e.preventDefault()}
          className="grid h-14 w-14 touch-none select-none place-items-center rounded-full bg-morgo-pink-soft text-3xl shadow-md transition active:scale-95 disabled:opacity-30"
        >
          {holding ? "😗" : "💋"}
        </button>
        <span className="whitespace-pre-line text-center text-[10px] font-bold leading-tight text-morgo-navy/55">
          {cleared
            ? "다 날아갔다!"
            : holding
              ? windFull
                ? "💨 최대 바람!"
                : `바람 ${Math.round(wind * 100)}%`
              : blownRatio > 0
                ? "계속 꾹—\n더 불어요"
                : "꾹 누르면\n바람이 불어요"}
        </span>
      </div>
    </div>
  );
}

// ── 아이: 크레인 인형뽑기 ───────────────────────────────────────
type ClawPhase =
  | "aim"
  | "align" // 잡기 직전, 캡슐 바로 위로 스르륵 정렬
  | "drop"
  | "grab"
  | "lift"
  | "carry"
  | "release"
  | "done";

// 캡슐 더미 — 바닥 줄 위에 한 줄 더 쌓여 실제 뽑기 기계처럼 그득하다. 배출구(오른쪽) 앞은 비워둔다
const CAPSULE_COLORS = [
  "bg-morgo-pink",
  "bg-sky-400",
  "bg-morgo-yellow",
  "bg-morgo-mint",
  "bg-orange-400",
  "bg-purple-400",
  "bg-red-400",
  "bg-lime-400",
];
const CLAW_CAPSULES = [
  // 바닥 줄
  ...[8, 18, 28, 38, 48, 58, 68].map((left, i) => ({
    left,
    layer: 0,
    color: CAPSULE_COLORS[i % CAPSULE_COLORS.length],
  })),
  // 그 위에 얹힌 줄 (바닥 캡슐 사이 골에 걸쳐 있다)
  ...[13, 23, 33, 43, 53, 63].map((left, i) => ({
    left,
    layer: 1,
    color: CAPSULE_COLORS[(i + 3) % CAPSULE_COLORS.length],
  })),
];
const CHUTE_X = 88; // 배출구 x(%)
const ROD_HEIGHT = [128, 111]; // 층별 와이어 길이 — 윗줄 캡슐은 덜 내려간다
const CAPSULE_BOTTOM = [6, 23]; // 층별 바닥 오프셋(px)
const GRABBING = new Set<ClawPhase>(["grab", "lift", "carry"]);

/**
 * 크레인을 좌우로 드래그해 조준하고 '잡기'를 누르면
 * 내려가서 가장 가까운 캡슐을 집어 배출구까지 옮겨 떨어뜨린다.
 */
function ClawMachine({
  onGrabStart,
  onCaught,
}: {
  /** '잡기'를 누른 순간 — 크레인이 움직이는 동안 목적지 AI를 미리 돌린다 */
  onGrabStart: () => void;
  /** 캡슐이 배출구로 떨어진 순간 — 뽑힌 캡슐 색을 넘긴다 */
  onCaught: (color: string) => void;
}) {
  const [clawX, setClawX] = useState(32);
  const [cphase, setCphase] = useState<ClawPhase>("aim");
  const [grabbed, setGrabbed] = useState<number | null>(null);
  const [targetIdx, setTargetIdx] = useState<number | null>(null); // 조준이 확정된 캡슐 (와이어 길이용)
  const windowRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const ref = timers;
    return () => ref.current.forEach(clearTimeout);
  }, []);

  const moveClaw = (e: React.PointerEvent) => {
    const el = windowRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setClawX(clamp(((e.clientX - r.left) / r.width) * 100, 8, 76));
  };

  const grab = () => {
    if (cphase !== "aim") return;
    onGrabStart();
    // 크레인 바로 아래(가장 가까운) 캡슐을 잡는다 — 겹치면 위에 얹힌 캡슐이 먼저 잡힌다
    let best = 0;
    let bd = Infinity;
    CLAW_CAPSULES.forEach((c, i) => {
      const d = Math.abs(c.left - clawX) + (c.layer === 0 ? 4 : 0);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    vibrate(8);
    const t = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    setTargetIdx(best);
    // 캡슐 정중앙으로 정렬 → 그 자리에서 수직으로 내려가 집는다 (집게-캡슐이 항상 딱 맞물림)
    setCphase("align");
    setClawX(CLAW_CAPSULES[best].left);
    t(() => setCphase("drop"), 380);
    t(() => {
      setCphase("grab");
      setGrabbed(best);
      vibrate([10, 40, 14]);
    }, 900);
    t(() => setCphase("lift"), 1280);
    t(() => {
      setCphase("carry");
      setClawX(CHUTE_X);
    }, 1880);
    t(() => {
      setCphase("release");
      vibrate([8, 60, 18]);
    }, 2680);
    t(() => {
      setCphase("done");
      onCaught(CLAW_CAPSULES[best].color);
    }, 3140);
  };

  const rodDown = cphase === "drop" || cphase === "grab";
  const prongOpen = !GRABBING.has(cphase);
  const grabbedColor = grabbed !== null ? CLAW_CAPSULES[grabbed].color : "";
  const hint =
    cphase === "aim"
      ? "크레인을 옮기고 '잡기'를 눌러요"
      : cphase === "align" || cphase === "drop"
        ? "조준…!"
        : cphase === "done"
          ? "캡슐이 나왔어요!"
          : cphase === "carry" || cphase === "release"
            ? "떨어뜨리지 마…!"
            : "집었다…!";

  return (
    <div className="flex flex-col items-center">
      <div className="w-56">
        {/* 유리창 — 크레인 조준은 여기서 드래그 */}
        <div
          ref={windowRef}
          onPointerDown={(e) => {
            if (cphase !== "aim") return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            draggingRef.current = true;
            moveClaw(e);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current && cphase === "aim") moveClaw(e);
          }}
          onPointerUp={() => (draggingRef.current = false)}
          onPointerCancel={() => (draggingRef.current = false)}
          className="relative h-44 touch-none select-none overflow-hidden rounded-t-2xl border-[3px] border-b-0 border-morgo-navy/20 bg-gradient-to-b from-sky-100/70 to-white/40"
          style={{ cursor: cphase === "aim" ? "grab" : "default" }}
        >
          {/* 레일 */}
          <div className="absolute inset-x-2 top-2 h-1.5 rounded-full bg-morgo-navy/15" />

          {/* 크레인 어셈블리 */}
          <div
            className="absolute top-2 z-10"
            style={{
              left: `${clawX}%`,
              transform: "translateX(-50%)",
              transition:
                cphase === "aim"
                  ? "none"
                  : cphase === "align"
                    ? "left 340ms ease-out"
                    : "left 720ms ease-in-out",
            }}
          >
            {/* 와이어 — 조준한 캡슐의 층 높이까지 정확히 내려간다 */}
            <div
              className="mx-auto w-1 rounded-full bg-morgo-navy/40"
              style={{
                height: rodDown
                  ? ROD_HEIGHT[targetIdx !== null ? CLAW_CAPSULES[targetIdx].layer : 0]
                  : 12,
                transition: "height 460ms ease-in",
              }}
            />
            {/* 집게 — 잡으면 오므라든다 */}
            <div className="relative mx-auto -mt-0.5 h-5 w-7">
              <span className="absolute left-1/2 top-0 h-2 w-4 -translate-x-1/2 rounded-sm bg-morgo-navy" />
              <span
                className="absolute left-0.5 top-1 h-4 w-1.5 origin-top rounded-full bg-morgo-navy transition-transform duration-300"
                style={{ transform: `rotate(${prongOpen ? -26 : -4}deg)` }}
              />
              <span
                className="absolute right-0.5 top-1 h-4 w-1.5 origin-top rounded-full bg-morgo-navy transition-transform duration-300"
                style={{ transform: `rotate(${prongOpen ? 26 : 4}deg)` }}
              />
              {/* 집힌 캡슐 — 옮기는 동안 아슬아슬하게 흔들린다 */}
              {grabbed !== null && GRABBING.has(cphase) && (
                <div
                  className="absolute left-1/2 top-3 h-6 w-6 -translate-x-1/2 overflow-hidden rounded-full shadow"
                  style={
                    cphase !== "grab"
                      ? { animation: "claw-wobble 0.5s ease-in-out infinite" }
                      : undefined
                  }
                >
                  <div className={`h-1/2 w-full ${grabbedColor}`} />
                  <div className="h-1/2 w-full bg-white" />
                </div>
              )}
            </div>
          </div>

          {/* 캡슐 더미 — 아랫줄 위에 윗줄이 얹혀 있다 */}
          {CLAW_CAPSULES.map((c, i) =>
            i === grabbed ? null : (
              <div
                key={i}
                className="absolute h-6 w-6 -translate-x-1/2 overflow-hidden rounded-full shadow"
                style={{ left: `${c.left}%`, bottom: CAPSULE_BOTTOM[c.layer], zIndex: c.layer }}
              >
                <div className={`h-1/2 w-full ${c.color}`} />
                <div className="h-1/2 w-full bg-white" />
              </div>
            ),
          )}

          {/* 배출구 */}
          <div
            className="absolute bottom-0 h-8 w-10 -translate-x-1/2 rounded-t-md bg-morgo-navy/80"
            style={{ left: `${CHUTE_X}%` }}
          >
            <div className="pt-1 text-center text-[9px] font-bold text-white/60">OUT</div>
            {/* 놓은 캡슐이 배출구로 톡 떨어진다 */}
            {cphase === "release" && grabbed !== null && (
              <div
                className="absolute left-1/2 top-1 -ml-3 h-6 w-6 overflow-hidden rounded-full"
                style={{ animation: "capsule-drop 420ms ease-in forwards" }}
              >
                <div className={`h-1/2 w-full ${grabbedColor}`} />
                <div className="h-1/2 w-full bg-white" />
              </div>
            )}
          </div>
        </div>

        {/* 본체 */}
        <div className="relative h-24 w-full rounded-b-2xl bg-morgo-pink shadow-lg">
          <button
            type="button"
            onClick={grab}
            disabled={cphase !== "aim"}
            className="absolute left-4 top-1/2 min-h-[48px] w-24 -translate-y-1/2 rounded-xl bg-morgo-navy text-sm font-extrabold text-white shadow-md active:scale-95 disabled:opacity-50"
          >
            {cphase === "aim" ? "🕹️ 잡기!" : "잡는 중…"}
          </button>
          {/* 배출 트레이 */}
          <div className="absolute right-4 top-1/2 grid h-14 w-16 -translate-y-1/2 place-items-center rounded-lg bg-morgo-navy/85">
            {cphase === "done" && grabbed !== null && (
              <div
                className="h-7 w-7 overflow-hidden rounded-full border border-white/40"
                style={{ animation: "capsule-bounce 0.7s ease-in-out infinite" }}
              >
                <div className={`h-1/2 w-full ${grabbedColor}`} />
                <div className="h-1/2 w-full bg-white" />
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold text-morgo-navy/55">{hint}</p>
    </div>
  );
}

// ── 아이: 뽑힌 캡슐 클로즈업 ─────────────────────────────────────
type CapsuleStage = "shaking" | "opening" | "open";

/**
 * 뽑힌 캡슐로 화면이 집중되는 클로즈업.
 * AI가 도는 동안 캡슐이 들썩들썩 흔들리며 이음새에서 연기가 피어오르고,
 * 결과가 준비되면 뚜껑이 팡— 열리면서 목적지가 나온다.
 */
function CapsuleFocus({
  color,
  ready,
  cityName,
  onOpened,
}: {
  /** 뽑힌 캡슐 색 (ClawMachine에서 넘어옴) */
  color: string;
  /** 목적지 API가 끝났는지 */
  ready: boolean;
  cityName: string | null;
  /** 뚜껑이 완전히 열렸을 때 */
  onOpened: () => void;
}) {
  const [stage, setStage] = useState<CapsuleStage>("shaking");

  useEffect(() => {
    if (!ready) return;
    // 마지막으로 한 번 더 부르르 떨고 → 뚜껑이 열린다
    const t1 = window.setTimeout(() => {
      setStage("opening");
      vibrate([14, 40, 26]);
    }, 550);
    const t2 = window.setTimeout(() => setStage("open"), 1100);
    const t3 = window.setTimeout(onOpened, 1150);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const split = stage !== "shaking";

  return (
    <div className="relative grid h-64 w-full place-items-center overflow-hidden rounded-2xl">
      {/* 스포트라이트 — 주변이 어두워지며 캡슐에만 집중된다 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,24,46,0.25)_0%,rgba(20,24,46,0.82)_78%)]" />

      <div className="relative" style={{ animation: "gacha-pop 450ms ease-out" }}>
        {/* 마법 오라 — 캡슐 뒤에서 숨쉬듯 맥동한다 */}
        {stage === "shaking" && (
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(255,205,120,0.55)_0%,rgba(233,30,99,0.25)_45%,transparent_70%)]"
            style={{ animation: "aura-pulse 1.6s ease-in-out infinite" }}
          />
        )}

        {/* 색색 연기 — AI가 다 돌 때까지 이음새에서 뭉게뭉게 */}
        {stage === "shaking" &&
          [
            { left: "12%", drift: "-16px", delay: 0, size: 18, color: "bg-pink-300/85" },
            { left: "30%", drift: "-6px", delay: 0.5, size: 13, color: "bg-purple-300/80" },
            { left: "46%", drift: "4px", delay: 0.2, size: 20, color: "bg-amber-200/85" },
            { left: "62%", drift: "12px", delay: 0.75, size: 14, color: "bg-sky-300/80" },
            { left: "78%", drift: "18px", delay: 0.35, size: 17, color: "bg-emerald-200/80" },
            { left: "22%", drift: "-12px", delay: 1.0, size: 11, color: "bg-white/85" },
            { left: "56%", drift: "8px", delay: 1.15, size: 12, color: "bg-rose-300/80" },
            { left: "70%", drift: "-4px", delay: 0.9, size: 16, color: "bg-violet-200/80" },
          ].map((s, i) => (
            <span
              key={`smoke-${i}`}
              aria-hidden
              className={`absolute top-1/2 rounded-full blur-[3px] ${s.color}`}
              style={{
                left: s.left,
                width: s.size,
                height: s.size,
                "--drift": s.drift,
                animation: `smoke-rise ${1.3 + (i % 3) * 0.25}s ease-out ${s.delay}s infinite`,
              } as React.CSSProperties}
            />
          ))}

        {/* 금빛 반짝이 — 연기 사이로 빙글 돌며 솟아오른다 */}
        {stage === "shaking" &&
          [
            { left: "20%", drift: "-10px", delay: 0.1, tw: "260deg", size: 12, glyph: "✦", color: "text-amber-200" },
            { left: "50%", drift: "6px", delay: 0.6, tw: "-220deg", size: 15, glyph: "✧", color: "text-yellow-100" },
            { left: "74%", drift: "14px", delay: 0.3, tw: "300deg", size: 10, glyph: "✦", color: "text-amber-300" },
            { left: "36%", drift: "-4px", delay: 1.05, tw: "-260deg", size: 11, glyph: "✧", color: "text-white" },
            { left: "64%", drift: "10px", delay: 0.85, tw: "240deg", size: 13, glyph: "✦", color: "text-orange-200" },
          ].map((s, i) => (
            <span
              key={`spark-${i}`}
              aria-hidden
              className={`absolute top-1/2 leading-none ${s.color}`}
              style={{
                left: s.left,
                fontSize: s.size,
                textShadow: "0 0 6px rgba(255,220,140,0.9)",
                "--drift": s.drift,
                "--tw": s.tw,
                animation: `sparkle-rise ${1.5 + (i % 2) * 0.4}s ease-out ${s.delay}s infinite`,
              } as React.CSSProperties}
            >
              {s.glyph}
            </span>
          ))}

        {/* 캡슐 본체 — 결과 기다리는 동안 계속 들썩인다 */}
        <div
          className="relative h-32 w-32"
          style={
            stage === "shaking"
              ? { animation: "capsule-shake 0.55s ease-in-out infinite" }
              : undefined
          }
        >
          {/* 열리는 순간 터지는 빛 */}
          {split && (
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-morgo-yellow/80"
              style={{ animation: "capsule-glow 600ms ease-out forwards" }}
            />
          )}

          {/* 위 뚜껑 */}
          <div
            className={`absolute inset-x-0 top-0 h-1/2 rounded-t-full shadow-lg ${color} transition-all duration-500`}
            style={{
              transform: split ? "translateY(-46px) rotate(-16deg)" : undefined,
              transitionTimingFunction: "cubic-bezier(.2,.9,.3,1.2)",
            }}
          >
            <span className="absolute left-5 top-4 h-4 w-8 rounded-full bg-white/35" />
          </div>
          {/* 아래 컵 */}
          <div
            className="absolute inset-x-0 bottom-0 h-1/2 rounded-b-full bg-white shadow-lg transition-all duration-500"
            style={{
              transform: split ? "translateY(16px) rotate(5deg)" : undefined,
              transitionTimingFunction: "cubic-bezier(.2,.9,.3,1.2)",
            }}
          />

          {/* 열리면 목적지가 팡— */}
          {stage === "open" && cityName && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
              style={{ animation: "gacha-pop 500ms ease-out" }}
            >
              <div className="text-3xl">✨</div>
              <div className="mt-1 whitespace-nowrap rounded-full bg-morgo-navy px-3 py-1 text-base font-extrabold text-white shadow-md">
                {cityName}
              </div>
            </div>
          )}
        </div>
      </div>

      {stage === "shaking" && (
        <p className="absolute bottom-3 text-xs font-bold text-white/85">
          🔮 캡슐 안에서 갈 곳이 정해지는 중…
        </p>
      )}
    </div>
  );
}

/**
 * 부모/아이 테마 전용 '목적지 뽑기'.
 *  - 부모: 벚꽃잎·나뭇잎이 지도를 덮고 있고, 입술 버튼으로 바람을 모아 후— 불어 날리면
 *    당첨 지역이 확대되며 드러난다 (핀 없음).
 *  - 아이: 크레인 인형뽑기 — 캡슐을 집어 뽑으면 캡슐 클로즈업으로 전환,
 *    연기와 함께 흔들리다가 뚜껑이 열리며 목적지가 나온다.
 * 이미 갔거나 여행 중인 도시(excludeCityIds) + 이번 세션에 뽑힌 곳은 다시 나오지 않는다.
 */
export default function ThemeDestinationPicker({
  theme,
  onConfirm,
  onClose,
  excludeCityIds = [],
}: {
  theme: PlannedTheme;
  onConfirm: (cityId: string, rarity: Rarity, spot: PlaceSpot) => void;
  onClose: () => void;
  excludeCityIds?: string[];
}) {
  const regions = useKoreaRegions();
  const copy = COPY[theme];
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<SpotResult | null>(null);
  const [cleared, setCleared] = useState(false); // 부모: 꽃잎을 전부 날렸는지
  const [caughtColor, setCaughtColor] = useState<string | null>(null); // 아이: 뽑힌 캡슐 색
  const [opened, setOpened] = useState(false); // 아이: 캡슐 뚜껑이 열렸는지
  const [attempt, setAttempt] = useState(0); // 다시 뽑기 시 연출 컴포넌트 리셋용
  const seq = useRef(0);
  const shownRef = useRef<Set<string>>(new Set());

  const fallbackResult = useCallback((): SpotResult => {
    const skip = new Set([...excludeCityIds, ...shownRef.current]);
    const pool = CITIES.filter((c) => !skip.has(c.id));
    const list = pool.length > 0 ? pool : CITIES;
    const city = list[Math.floor(Math.random() * list.length)];
    const extra = getCityExtra(city.id);
    return {
      city,
      spot: {
        name: extra?.landmark ?? cityLabel(city),
        description: extra?.intro ?? `${cityLabel(city)}의 대표 명소로 떠나요.`,
      },
    };
  }, [excludeCityIds]);

  const pick = useCallback(async () => {
    const my = ++seq.current;
    setPhase("loading");
    setResult(null);
    const skip = new Set([...excludeCityIds, ...shownRef.current]);
    try {
      const res = await fetch("/api/theme-destination", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      const data = await res.json();
      if (seq.current !== my) return;
      const spots: {
        name: string;
        province: string;
        city: string;
        description: string;
      }[] = data?.spots ?? [];
      for (const s of spots) {
        const city = findCityByRegion(s.province, s.city);
        if (city && !skip.has(city.id)) {
          if (seq.current !== my) return;
          shownRef.current.add(city.id);
          // 연출이 너무 빨리 끝나지 않도록 최소 시간 확보
          await new Promise((r) => setTimeout(r, 500));
          if (seq.current !== my) return;
          setResult({ city, spot: { name: s.name, description: s.description } });
          setPhase("revealed");
          return;
        }
      }
    } catch {
      // 오류 → 폴백
    }
    if (seq.current !== my) return;
    const fb = fallbackResult();
    shownRef.current.add(fb.city.id);
    await new Promise((r) => setTimeout(r, 500));
    if (seq.current !== my) return;
    setResult(fb);
    setPhase("revealed");
  }, [theme, excludeCityIds, fallbackResult]);

  const reroll = () => {
    setResult(null);
    setCleared(false);
    setCaughtColor(null);
    setOpened(false);
    setAttempt((a) => a + 1);
    setPhase("idle");
  };

  // 결과 공개 완료: 부모는 꽃잎을 다 날렸을 때, 아이는 캡슐 뚜껑이 열렸을 때
  const revealDone = phase === "revealed" && (theme === "baby" ? opened : cleared);
  // 당첨 도시의 지도상 위치(%) — 부모 지도 확대 기준점 (핀은 안 그린다)
  const targetPct = (() => {
    if (phase !== "revealed" || !result) return null;
    const p = projectKorea(result.city.officeLatitude, result.city.officeLongitude);
    return { left: (p.x / MAP_VIEW.w) * 100, top: (p.y / MAP_VIEW.h) * 100 };
  })();

  const subtitle = revealDone
    ? "오늘 갈 곳이에요"
    : theme === "parents"
      ? cleared
        ? "두구두구…"
        : "입술을 꾹 누르고 있으면 바람이 꽃잎을 날려요"
      : caughtColor
        ? "캡슐이 열리길 기다려요…"
        : "크레인으로 캡슐을 직접 잡아요";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center">
      <div className="no-scrollbar max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-morgo-card p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold">
              {copy.emoji} {copy.title}
            </h2>
            <p className="mt-0.5 text-sm text-morgo-navy/55">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-morgo-navy/10 px-2.5 py-1 text-sm text-morgo-navy/60"
          >
            ✕
          </button>
        </div>

        {/* 연출 영역 */}
        <div className="relative mt-4 grid min-h-[20rem] w-full place-items-center overflow-hidden rounded-2xl bg-morgo-cream p-3">
          {theme === "parents" ? (
            regions ? (
              <WindPetalMap
                key={attempt}
                regions={regions}
                targetCode={result?.city.code}
                targetPct={targetPct}
                cityName={result ? cityLabel(result.city) : null}
                revealed={phase === "revealed"}
                onStart={() => {
                  if (phase === "idle") pick();
                }}
                onCleared={() => setCleared(true)}
              />
            ) : (
              <p className="text-sm text-morgo-navy/40">지도 불러오는 중…</p>
            )
          ) : !caughtColor ? (
            <ClawMachine
              key={attempt}
              onGrabStart={() => {
                if (phase === "idle") pick();
              }}
              onCaught={(color) => setCaughtColor(color)}
            />
          ) : (
            <CapsuleFocus
              key={`focus-${attempt}`}
              color={caughtColor}
              ready={phase === "revealed"}
              cityName={result ? cityLabel(result.city) : null}
              onOpened={() => setOpened(true)}
            />
          )}
        </div>

        {revealDone && result ? (
          <div className="mt-4">
            <div className="rounded-2xl bg-morgo-cream p-4">
              <div className="text-[11px] text-morgo-navy/50">가볼 곳</div>
              <div className="mt-0.5 text-lg font-extrabold">
                📍 {result.spot.name}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-morgo-navy/70">
                {result.spot.description}
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={reroll}
                className="min-h-[48px] flex-1 rounded-xl border border-morgo-navy/20 font-semibold text-morgo-navy/70"
              >
                {theme === "baby" ? "🔄 다시 뽑기" : "🔄 다시 불기"}
              </button>
              <button
                type="button"
                onClick={() => onConfirm(result.city.id, "common", result.spot)}
                className="min-h-[48px] flex-[1.5] rounded-xl bg-morgo-navy font-extrabold text-white"
              >
                여기로 가요
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 min-h-[52px] w-full content-center rounded-xl bg-morgo-navy/5 text-center font-bold text-morgo-navy/40">
            {theme === "parents"
              ? cleared
                ? "바람이 목적지를 정하는 중…"
                : "💋 입술을 꾹 누르고 있는 동안 후— 바람이 불어요"
              : caughtColor
                ? "캡슐 여는 중…"
                : "🕹️ 크레인을 드래그로 옮기고 '잡기'를 눌러요"}
          </div>
        )}
      </div>
    </div>
  );
}
