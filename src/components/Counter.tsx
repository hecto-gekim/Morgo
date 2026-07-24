"use client";

export default function Counter({
  label,
  sub,
  value,
  onChange,
  min = 0,
  max = 8,
}: {
  label: string;
  sub?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="font-medium">{label}</div>
        {sub && <div className="text-xs text-morgo-navy/50">{sub}</div>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`${label} 감소`}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="h-11 w-11 rounded-full border border-morgo-navy/20 text-lg font-bold text-morgo-navy/70 disabled:opacity-30 active:bg-morgo-yellow-soft"
        >
          −
        </button>
        <span className="w-6 text-center font-semibold">{value}</span>
        <button
          type="button"
          aria-label={`${label} 증가`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="h-11 w-11 rounded-full border border-morgo-navy/20 text-lg font-bold text-morgo-navy/70 disabled:opacity-30 active:bg-morgo-yellow-soft"
        >
          +
        </button>
      </div>
    </div>
  );
}
