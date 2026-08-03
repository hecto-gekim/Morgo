"use client";

import { useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import KoreaMap from "@/components/KoreaMap";
import { fileToThumbDataUrl } from "@/lib/image";
import { cityLabel, getCity, getCityByCode, getCityExtra } from "@/lib/seed";
import { useMorgo } from "@/lib/store";
import { useKoreaRegions } from "@/lib/useKoreaRegions";
import type { CityRecord } from "@/lib/types";

export default function MapPage() {
  return (
    <AppShell>
      <MapContent />
    </AppShell>
  );
}

/** 폴리곤 클릭 대상: 코드 → 저장 키(시드면 도시 id, 아니면 코드) */
function regionKeyOf(code: string): string {
  return getCityByCode(code)?.id ?? code;
}

function MapContent() {
  const cityRecords = useMorgo((s) => s.cityRecords);
  const trips = useMorgo((s) => s.trips);
  const horrorMode = useMorgo((s) => s.theme === "horror");
  const regions = useKoreaRegions();
  const [selected, setSelected] = useState<{ code: string; name: string } | null>(
    null,
  );

  // 공개(REVEALED) 이후 여행 중인 도시만 강조 (명세서 16.3)
  const activeTrip = trips.find((t) =>
    ["REVEALED", "TRIP_IN_PROGRESS"].includes(t.status),
  );
  const activeCode = activeTrip
    ? getCity(activeTrip.cityId)?.code
    : undefined;

  const records = Object.values(cityRecords);
  const visitedCount = records.length;
  const photoCount = records.reduce((n, r) => n + r.photos.length, 0);

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-extrabold">대한민국 여행 지도</h1>
          <p className="mt-0.5 text-sm text-morgo-navy/55">
            시·군을 눌러 사진을 남겨보세요.
          </p>
        </div>
        <div className="flex gap-2 text-center">
          <Stat value={visitedCount} label="방문 도시" />
          <Stat value={photoCount} label="사진" />
        </div>
      </div>

      <div className="mt-4 rounded-3xl bg-morgo-card p-3 shadow-sm">
        {regions ? (
          <KoreaMap
            regions={regions}
            records={cityRecords}
            activeCode={activeCode}
            selectedCode={selected?.code}
            onSelect={(code, name) => setSelected({ code, name })}
            horror={horrorMode}
          />
        ) : (
          <div className="grid aspect-[100/138] place-items-center text-sm text-morgo-navy/40">
            지도를 불러오는 중…
          </div>
        )}
        <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-morgo-navy/55">
          <Legend color="#fce3e6" label="여행지" />
          <Legend color="#f49ba8" label="방문·사진" />
          <Legend color="#f6d35c" label="여행 중" />
        </div>
      </div>

      {selected && (
        <CitySheet
          regionKey={regionKeyOf(selected.code)}
          code={selected.code}
          name={selected.name}
          record={cityRecords[regionKeyOf(selected.code)]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-morgo-card px-3 py-1.5 shadow-sm">
      <div className="text-lg font-extrabold text-morgo-pink">{value}</div>
      <div className="text-[10px] text-morgo-navy/50">{label}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function CitySheet({
  regionKey,
  code,
  name,
  record,
  onClose,
}: {
  regionKey: string;
  code: string;
  name: string;
  record: CityRecord | undefined;
  onClose: () => void;
}) {
  const seed = getCityByCode(code);
  const city = seed ? getCity(seed.id) : undefined;
  const extra = seed ? getCityExtra(seed.id) : undefined;
  const setCityPhoto = useMorgo((s) => s.setCityPhoto);
  const removeCityPhoto = useMorgo((s) => s.removeCityPhoto);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saved = record?.photos[0];

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      setPending(await fileToThumbDataUrl(file));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!pending) return;
    setCityPhoto(regionKey, pending);
    setPending(null);
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString("ko-KR") : "-";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-morgo-navy/40 md:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-morgo-cream p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-morgo-navy/15 md:hidden" />
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-extrabold">
              {city ? cityLabel(city) : name}
            </h2>
            {extra ? (
              <p className="mt-0.5 text-sm text-morgo-navy/60">
                {extra.landmarkEmoji} {extra.intro}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-morgo-navy/45">
                이 시·군에 대표 사진을 남겨보세요.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-morgo-card px-2.5 py-1 text-sm text-morgo-navy/50 shadow-sm"
          >
            ✕
          </button>
        </div>

        {record && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm">
            <MiniStat value={`${record.visitCount}회`} label="방문" />
            <MiniStat value={fmt(record.firstVisitAt)} label="첫 방문" />
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPick}
        />

        <h3 className="mt-4 font-bold">대표 사진 <span className="text-xs font-normal text-morgo-navy/40">(한 장)</span></h3>

        {pending ? (
          // 선택 → 미리보기 → 저장
          <div className="mt-2">
            <div className="overflow-hidden rounded-2xl border-2 border-dashed border-morgo-yellow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pending} alt="미리보기" className="max-h-64 w-full object-cover" />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="min-h-[48px] flex-1 rounded-xl border border-morgo-navy/20 font-semibold text-morgo-navy/70"
              >
                취소
              </button>
              <button
                type="button"
                onClick={save}
                className="min-h-[48px] flex-[1.5] rounded-xl bg-morgo-navy font-extrabold text-white"
              >
                💾 이 사진 저장 (지도에 표시)
              </button>
            </div>
          </div>
        ) : saved ? (
          // 저장된 사진 표시 + 변경/삭제
          <div className="mt-2">
            <div className="relative overflow-hidden rounded-2xl bg-morgo-card shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={saved.url} alt="대표 사진" className="max-h-64 w-full object-cover" />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => removeCityPhoto(regionKey, saved.id)}
                className="min-h-[48px] flex-1 rounded-xl border border-morgo-navy/20 font-semibold text-morgo-navy/70"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="min-h-[48px] flex-1 rounded-xl bg-morgo-navy font-bold text-white disabled:opacity-60"
              >
                {busy ? "불러오는 중…" : "사진 변경"}
              </button>
            </div>
          </div>
        ) : (
          // 사진 없음
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="mt-2 grid w-full place-items-center rounded-2xl border-2 border-dashed border-morgo-navy/15 py-10 text-center text-sm text-morgo-navy/45 disabled:opacity-60"
          >
            {busy ? "불러오는 중…" : "📷 사진 선택하기"}
          </button>
        )}
      </div>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-morgo-card p-2.5 shadow-sm">
      <div className="text-sm font-bold text-morgo-navy">{value}</div>
      <div className="mt-0.5 text-[10px] text-morgo-navy/45">{label}</div>
    </div>
  );
}
