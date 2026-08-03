"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { randomGhostImage } from "@/lib/ghost";

/**
 * 숨은 이스터에그 — 시연 중 깜짝 미션 타이밍을 못 맞춰도 언제든 유령을 소환한다.
 * 발동 방법(둘 다 됨):
 *   1) 화면 오른쪽 아래 구석의 투명 핫스팟을 1.2초 안에 3번 탭
 *   2) 키보드로 "ghost" 또는 "morgo" 타이핑 (데스크톱 시연용)
 * 전역(layout)에 마운트되어 어느 화면에서든 튀어나온다.
 */
export default function GhostEasterEgg() {
  const [scareImg, setScareImg] = useState<string | null>(null);
  const tapsRef = useRef<number[]>([]);
  const keyBufRef = useRef("");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const summon = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setScareImg(randomGhostImage());
    hideTimerRef.current = setTimeout(() => setScareImg(null), 2600);
  }, []);

  // 구석 3연타 감지
  const onHotspot = () => {
    const now = performance.now();
    tapsRef.current = [...tapsRef.current.filter((t) => now - t < 1200), now];
    if (tapsRef.current.length >= 3) {
      tapsRef.current = [];
      summon();
    }
  };

  // 키보드 시퀀스 감지
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.length !== 1) return;
      keyBufRef.current = (keyBufRef.current + e.key.toLowerCase()).slice(-6);
      if (keyBufRef.current.endsWith("ghost") || keyBufRef.current.endsWith("morgo")) {
        keyBufRef.current = "";
        summon();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [summon]);

  return (
    <>
      {/* 투명 핫스팟 — 보이지 않지만 탭은 받는다 */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onHotspot}
        className="fixed bottom-0 right-0 z-[80] h-11 w-11 cursor-default opacity-0"
        style={{ background: "transparent" }}
      />

      {scareImg && (
        <div
          onClick={() => setScareImg(null)}
          className="fixed inset-0 z-[90] grid cursor-pointer place-items-center overflow-hidden bg-black"
          style={{ animation: "dart-legendary-shake 350ms ease-in-out" }}
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
              뒤 돌아보지 마
            </p>
          </div>
        </div>
      )}
    </>
  );
}
