"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import Chip from "@/components/Chip";
import Counter from "@/components/Counter";
import { resolveCurrentDeparture } from "@/lib/geo";
import { addDays, todayStr } from "@/lib/logic";
import { DEPARTURE_PRESETS } from "@/lib/seed";
import { useMorgo } from "@/lib/store";
import {
  ACCOMMODATION_TYPE_LABELS,
  DISTANCE_RANGE_LABELS,
  FACILITY_LABELS,
  type AccommodationType,
  type Departure,
  type DistanceRange,
  type Facility,
} from "@/lib/types";

const STEPS = ["출발지", "날짜", "인원", "거리", "예산", "숙소"] as const;

const BUDGET_OPTIONS = [
  { label: "10만 원 이하", value: 100000 },
  { label: "15만 원 이하", value: 150000 },
  { label: "20만 원 이하", value: 200000 },
  { label: "30만 원 이하", value: 300000 },
  { label: "제한 없음", value: 0 },
];

export default function NewTripPage() {
  return (
    <AppShell>
      <Wizard />
    </AppShell>
  );
}

function Wizard() {
  const router = useRouter();
  const createTrip = useMorgo((s) => s.createTrip);

  const [step, setStep] = useState(0);
  const [departure, setDeparture] = useState<Departure | null>(null);
  const [checkIn, setCheckIn] = useState(addDays(todayStr(), 7));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [pets, setPets] = useState(0);
  const [distance, setDistance] = useState<DistanceRange | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [types, setTypes] = useState<AccommodationType[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");

  const useMyLocation = async () => {
    setGeoError("");
    setLocating(true);
    try {
      setDeparture(await resolveCurrentDeparture());
    } catch (e) {
      setGeoError(e instanceof Error ? e.message : "위치를 가져오지 못했어요.");
    } finally {
      setLocating(false);
    }
  };

  const toggle = <T,>(arr: T[], v: T, set: (next: T[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const canNext = [
    departure !== null,
    checkIn >= todayStr(),
    adults >= 1,
    distance !== null,
    budget !== null,
    true, // 숙소 유형/편의시설은 선택 사항
  ][step];

  const submit = () => {
    if (!departure || !distance || budget === null) return;
    const id = createTrip({
      departure,
      checkInDate: checkIn,
      checkOutDate: addDays(checkIn, 1), // 알파: 1박 2일 고정
      adultCount: adults,
      childCount: children,
      infantCount: infants,
      petCount: pets,
      distanceRange: distance,
      maximumBudget: budget,
      accommodationTypes: types,
      requiredFacilities: facilities,
    });
    if (!id) {
      setError(
        "조건에 맞는 도시를 찾지 못했어요. 거리·예산·편의시설 조건을 완화해 보세요.",
      );
      return;
    }
    router.push(`/trip/${id}/offers`);
  };

  return (
    <div className="mx-auto max-w-xl">
      {/* 진행 표시 */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div
              className={`h-1.5 rounded-full ${
                i <= step ? "bg-morgo-yellow" : "bg-morgo-navy/10"
              }`}
            />
            <div
              className={`mt-1 text-center text-[10px] ${
                i === step ? "font-bold text-morgo-navy" : "text-morgo-navy/35"
              }`}
            >
              {s}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 min-h-[50vh]">
        {step === 0 && (
          <StepBox title="어디에서 출발하나요?" sub="출발지 기준으로 이동 거리를 계산해요.">
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-morgo-navy py-3.5 font-bold text-white disabled:opacity-60"
            >
              {locating ? "위치 찾는 중…" : "📍 현재 위치로 출발하기"}
            </button>
            {geoError && (
              <p className="mb-3 rounded-xl bg-morgo-pink-soft px-4 py-2.5 text-xs text-morgo-navy/75">
                {geoError}
              </p>
            )}
            {departure && !DEPARTURE_PRESETS.some((p) => p.label === departure.label) && (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-morgo-yellow bg-morgo-yellow-soft px-4 py-3 text-sm font-bold text-morgo-navy">
                <span>✓ {departure.label}</span>
                <span className="font-mono text-[11px] font-normal text-morgo-navy/50">
                  {departure.latitude.toFixed(3)}, {departure.longitude.toFixed(3)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 py-1 text-[11px] text-morgo-navy/35">
              <span className="h-px flex-1 bg-morgo-navy/10" />
              또는 시청에서 출발
              <span className="h-px flex-1 bg-morgo-navy/10" />
            </div>
            <div className="mt-2 space-y-2">
              {DEPARTURE_PRESETS.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setDeparture(d)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left ${
                    departure?.label === d.label
                      ? "border-morgo-yellow bg-morgo-yellow-soft font-bold text-morgo-navy"
                      : "border-morgo-navy/10 bg-morgo-card active:bg-morgo-yellow-soft"
                  }`}
                >
                  📍 {d.label}
                  {departure?.label === d.label && <span>✓</span>}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-morgo-navy/40">
              주소 검색은 다음 버전에서 지원돼요.
            </p>
          </StepBox>
        )}

        {step === 1 && (
          <StepBox title="언제 떠나나요?" sub="알파 버전은 1박 2일만 지원해요.">
            <label className="block text-sm font-semibold text-morgo-navy/80">
              체크인 날짜
              <input
                type="date"
                value={checkIn}
                min={todayStr()}
                onChange={(e) => setCheckIn(e.target.value)}
                className="mt-1 w-full rounded-xl border border-morgo-navy/15 bg-white px-3 py-3 text-base font-normal outline-none focus:border-morgo-yellow"
              />
            </label>
            <div className="mt-3 rounded-xl bg-morgo-mint-soft px-4 py-3 text-sm text-morgo-navy/75">
              체크아웃: <b>{addDays(checkIn, 1)}</b> (1박 2일)
            </div>
          </StepBox>
        )}

        {step === 2 && (
          <StepBox title="누구와 함께 가나요?">
            <div className="divide-y divide-morgo-navy/5 rounded-xl bg-morgo-card px-4 shadow-sm">
              <Counter label="성인" value={adults} onChange={setAdults} min={1} />
              <Counter label="아동" sub="만 3세~12세" value={children} onChange={setChildren} />
              <Counter label="유아" sub="만 3세 미만" value={infants} onChange={setInfants} />
              <Counter label="반려동물" value={pets} onChange={setPets} max={3} />
            </div>
          </StepBox>
        )}

        {step === 3 && (
          <StepBox title="얼마나 멀리 갈까요?" sub="출발지에서 도시(시청·군청 기준)까지의 거리예요.">
            <div className="space-y-2">
              {(Object.keys(DISTANCE_RANGE_LABELS) as DistanceRange[]).map(
                (r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDistance(r)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left ${
                      distance === r
                        ? "border-morgo-yellow bg-morgo-yellow-soft font-bold text-morgo-navy"
                        : "border-morgo-navy/10 bg-morgo-card active:bg-morgo-yellow-soft"
                    }`}
                  >
                    {DISTANCE_RANGE_LABELS[r]}
                    {distance === r && <span>✓</span>}
                  </button>
                ),
              )}
            </div>
          </StepBox>
        )}

        {step === 4 && (
          <StepBox title="1박 예산은 얼마인가요?">
            <div className="space-y-2">
              {BUDGET_OPTIONS.map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => setBudget(b.value)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left ${
                    budget === b.value
                      ? "border-morgo-yellow bg-morgo-yellow-soft font-bold text-morgo-navy"
                      : "border-morgo-navy/10 bg-morgo-card active:bg-morgo-yellow-soft"
                  }`}
                >
                  {b.label}
                  {budget === b.value && <span>✓</span>}
                </button>
              ))}
            </div>
          </StepBox>
        )}

        {step === 5 && (
          <StepBox
            title="어떤 숙소를 원하나요?"
            sub="선택하지 않으면 모든 유형에서 골라드려요."
          >
            <h3 className="text-sm font-bold text-morgo-navy/80">숙소 유형</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                Object.keys(ACCOMMODATION_TYPE_LABELS) as AccommodationType[]
              ).map((t) => (
                <Chip
                  key={t}
                  label={ACCOMMODATION_TYPE_LABELS[t]}
                  selected={types.includes(t)}
                  onClick={() => toggle(types, t, setTypes)}
                />
              ))}
            </div>
            <h3 className="mt-5 text-sm font-bold text-morgo-navy/80">
              필수 편의시설
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(FACILITY_LABELS) as Facility[]).map((f) => (
                <Chip
                  key={f}
                  label={FACILITY_LABELS[f]}
                  selected={facilities.includes(f)}
                  onClick={() => toggle(facilities, f, setFacilities)}
                />
              ))}
            </div>
          </StepBox>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-morgo-pink-soft px-4 py-3 text-sm font-semibold text-morgo-navy">
          {error}
        </p>
      )}

      {/* 하단 고정 CTA */}
      <div className="fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom))] z-30 border-t border-morgo-yellow-soft bg-morgo-card/95 p-3 backdrop-blur md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-xl gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="min-h-[48px] rounded-xl border border-morgo-navy/20 bg-morgo-card px-5 font-semibold text-morgo-navy/70"
            >
              이전
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => {
                setError("");
                setStep(step + 1);
              }}
              className="min-h-[48px] flex-1 rounded-xl bg-morgo-navy font-bold text-white disabled:bg-morgo-navy/20"
            >
              다음
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              className="min-h-[48px] flex-1 rounded-xl bg-morgo-navy font-bold text-white"
            >
              🎲 블라인드 숙소 뽑기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepBox({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xl font-extrabold">{title}</h2>
      {sub && <p className="mt-1 text-sm text-morgo-navy/55">{sub}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
