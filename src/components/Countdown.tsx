"use client";

import { useEffect, useState } from "react";

function diffParts(target: number) {
  const ms = Math.max(0, target - Date.now());
  return {
    done: ms === 0,
    d: Math.floor(ms / 86_400_000),
    h: Math.floor((ms / 3_600_000) % 24),
    m: Math.floor((ms / 60_000) % 60),
    s: Math.floor((ms / 1000) % 60),
  };
}

export default function Countdown({
  targetIso,
  onDone,
  compact = false,
}: {
  targetIso: string;
  onDone?: () => void;
  /** 이벤트 배너용 소형 표시 */
  compact?: boolean;
}) {
  const target = new Date(targetIso).getTime();
  const [parts, setParts] = useState(() => diffParts(target));

  useEffect(() => {
    const t = setInterval(() => {
      const p = diffParts(target);
      setParts(p);
      if (p.done) {
        clearInterval(t);
        onDone?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [target, onDone]);

  if (compact) {
    const compactCell = (v: number, label: string) => (
      <span className="inline-flex items-baseline gap-0.5">
        <span className="text-lg font-extrabold tabular-nums text-morgo-navy">
          {String(v).padStart(2, "0")}
        </span>
        <span className="text-[10px] text-morgo-navy/50">{label}</span>
      </span>
    );
    return (
      <span className="inline-flex items-baseline gap-1.5">
        {parts.d > 0 && compactCell(parts.d, "일")}
        {compactCell(parts.h, "시간")}
        {compactCell(parts.m, "분")}
        {compactCell(parts.s, "초")}
      </span>
    );
  }

  const cell = (v: number, label: string) => (
    <div className="flex flex-col items-center rounded-xl bg-white/10 px-3 py-2 min-w-[64px]">
      <span className="text-3xl font-extrabold tabular-nums text-morgo-yellow">
        {String(v).padStart(2, "0")}
      </span>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  );

  return (
    <div className="flex justify-center gap-2">
      {cell(parts.d, "일")}
      {cell(parts.h, "시간")}
      {cell(parts.m, "분")}
      {cell(parts.s, "초")}
    </div>
  );
}
