"use client";

import BlindImage from "./BlindImage";
import { formatWon } from "@/lib/logic";
import {
  ACCOMMODATION_TYPE_LABELS,
  FACILITY_LABELS,
  type Accommodation,
} from "@/lib/types";

/**
 * 블라인드 숙소 카드 — 명세서 10장.
 * 도시명·숙소명·주소·좌표 등 비공개 정보는 절대 렌더링하지 않는다.
 */
export default function BlindCard({
  acc,
  priority,
  onSelect,
}: {
  acc: Accommodation;
  priority?: 1 | 2 | 3;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full overflow-hidden rounded-2xl border-2 bg-morgo-card text-left shadow-sm transition-all ${
        priority
          ? "border-morgo-yellow ring-2 ring-morgo-yellow-soft"
          : "border-transparent active:scale-[0.99]"
      }`}
    >
      {priority && (
        <span className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-morgo-navy text-sm font-extrabold text-morgo-yellow shadow">
          {priority}순위
        </span>
      )}
      <BlindImage theme={acc.imageTheme} className="h-40 w-full" />
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-morgo-navy/55">
          <span className="rounded bg-morgo-yellow-soft px-1.5 py-0.5 font-semibold text-morgo-navy">
            {ACCOMMODATION_TYPE_LABELS[acc.type]}
          </span>
          <span>⭐ {acc.ratingBand}</span>
        </div>
        <h3 className="mt-1.5 font-bold">{acc.blindTitle}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-morgo-navy/65">
          {acc.blindDescription}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {acc.moodTags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-morgo-pink-soft px-2 py-0.5 text-[11px] font-medium text-morgo-navy/75"
            >
              #{t}
            </span>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-morgo-navy/55">
          <span>객실 {acc.roomSize}</span>
          <span>
            기준 {acc.baseCapacity}인 · 최대 {acc.maxCapacity}인
          </span>
          <span>침대 {acc.bedCount} · 화장실 {acc.bathCount}</span>
          <span>
            체크인 {acc.checkInTime} / 아웃 {acc.checkOutTime}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-morgo-navy/60">
          {acc.facilities.map((f) => (
            <span key={f} className="rounded bg-morgo-mint-soft px-1.5 py-0.5">
              {FACILITY_LABELS[f]}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-end justify-between">
          <span className="text-[11px] text-morgo-navy/40">
            {acc.cancelPolicy}
          </span>
          <span className="text-lg font-extrabold">
            {formatWon(acc.price)}
            <span className="text-xs font-normal text-morgo-navy/50"> /1박</span>
          </span>
        </div>
      </div>
    </button>
  );
}
