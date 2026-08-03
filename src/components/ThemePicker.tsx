"use client";

import { useMorgo } from "@/lib/store";
import { THEME_EMOJI, THEME_LABELS, type TripTheme } from "@/lib/types";

/** 첫 화면 테마 선택지 — 라벨/이모지는 types의 공용 맵에서, 설명·강조색만 여기서 */
const THEME_CARDS: {
  key: TripTheme;
  desc: string;
  accent: string;
}[] = [
  {
    key: "normal",
    desc: "다트를 던져 오늘 갈 곳을 정하는 기본 모드",
    accent: "bg-morgo-yellow-soft text-morgo-navy",
  },
  {
    key: "horror",
    desc: "주술로 소환된 으스스한 그곳으로 끌려가는 공포 모드",
    accent: "bg-[#17111c] text-[#7cff3d]",
  },
  {
    key: "parents",
    desc: "부모님과 함께, 효도·추억 위주의 편안한 여행",
    accent: "bg-morgo-pink-soft text-morgo-navy",
  },
  {
    key: "baby",
    desc: "아기와 함께, 안전·편의 시설 위주의 여행",
    accent: "bg-morgo-mint-soft text-morgo-navy",
  },
];

/**
 * 앱 첫 진입 시 뜨는 전체화면 테마 선택 오버레이.
 * 선택하면 setTheme으로 themeChosen=true 가 되어 다시 뜨지 않는다(마이페이지에서 언제든 변경).
 */
export default function ThemePicker() {
  const setTheme = useMorgo((s) => s.setTheme);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-morgo-navy/85 p-5">
      <div className="w-full max-w-md rounded-3xl bg-morgo-card p-6 shadow-2xl">
        <h1 className="text-center text-xl font-extrabold">
          어떤 여행으로 떠날까요?
        </h1>
        <p className="mt-1 text-center text-sm text-morgo-navy/55">
          테마에 따라 분위기와 미션이 달라져요. 나중에 마이에서 바꿀 수 있어요.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {THEME_CARDS.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setTheme(card.key)}
              className="flex flex-col rounded-2xl border border-morgo-navy/10 bg-morgo-card p-4 text-left transition active:scale-[0.98] hover:border-morgo-navy/25"
            >
              <span
                className={`grid h-12 w-12 place-items-center rounded-xl text-2xl ${card.accent}`}
              >
                {THEME_EMOJI[card.key]}
              </span>
              <span className="mt-3 font-extrabold">
                {THEME_LABELS[card.key]}
              </span>
              <span className="mt-1 text-xs leading-relaxed text-morgo-navy/55">
                {card.desc}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
