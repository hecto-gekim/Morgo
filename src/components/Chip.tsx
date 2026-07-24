"use client";

export default function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] rounded-full border px-4 text-sm transition-colors ${
        selected
          ? "border-morgo-yellow bg-morgo-yellow text-morgo-navy font-bold"
          : "border-morgo-navy/15 bg-morgo-card text-morgo-navy/70 active:bg-morgo-yellow-soft"
      }`}
    >
      {label}
    </button>
  );
}
