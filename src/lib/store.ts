"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createTripPlan,
  getCurrentEvent,
  makeBookingNumber,
  revealAtOf,
  todayStr,
  totalEarnedPoints,
} from "./logic";
import { CITIES, DEPARTURE_PRESETS, getCity } from "./seed";
import type {
  CityPhoto,
  CityRecord,
  Mission,
  Rarity,
  Trip,
  TripChoice,
  TripConditions,
  TripMission,
  User,
} from "./types";

interface MorgoState {
  user: User | null;
  trips: Trip[];
  bookingSeq: number;
  /** 지금까지 다시 던지기 등에 사용한 포인트 총합. 배지용 평생 포인트(totalEarnedPoints)에서 이만큼을 뺀 게 실제 쓸 수 있는 잔액 */
  spentPoints: number;
  /** 연속으로 일반 등급만 나온 핀 던지기 횟수 (천장 시스템 — PITY_THRESHOLD 넘으면 다음은 레어 확정) */
  pityCount: number;
  /** 공포 테마(전체 앱 색상 리스킨) 켜짐 여부 */
  horrorMode: boolean;
  toggleHorrorMode: () => void;
  /** 방문 도시 + 사진 기록 (명세서 15~16장) — cityId 키 */
  cityRecords: Record<string, CityRecord>;
  login: (user: User) => void;
  logout: () => void;
  /** 조건으로 여행 생성. 후보 도시가 없으면 null */
  createTrip: (conditions: TripConditions) => string | null;
  /** 예약 없이 즉석 랜덤 여행 생성 → 바로 공개(도착) 상태 + 미션 배정. cityId/rarity는 지도 핀 던지기 연출 결과 */
  createInstantTrip: (cityId?: string, rarity?: Rarity) => string;
  setChoices: (tripId: string, choices: TripChoice[]) => void;
  /** 테스트 결제 + 가짜 예약 생성 (명세서 12장 시뮬레이션) */
  confirmBooking: (tripId: string) => void;
  /** 공개 시각 도달 시 상태 전환 + 미션 할당. 개발용 강제 공개 포함 */
  reveal: (tripId: string, opts?: { force?: boolean }) => boolean;
  cancelTrip: (tripId: string) => void;
  /** 여행 완료 처리 → 방문 도시 등록 (명세서 15.3) */
  completeTrip: (tripId: string) => void;
  /** 도착 룰렛 결과를 여행 미션으로 추가 */
  addTripMission: (tripId: string, mission: Mission) => void;
  /** AI가 생성한 시작 미션 세트를 저장 (공개 화면 마운트 시 1회) */
  setTripMissions: (tripId: string, missions: TripMission[]) => void;
  /** 미션 사진 제출 (Phase 5: 시뮬레이션 판정) */
  submitMission: (
    tripId: string,
    missionId: string,
    imageUrl: string,
  ) => void;
  /** 미션 판정 완료 처리 (ANALYZING → PASSED/FAILED) */
  resolveMission: (
    tripId: string,
    missionId: string,
    status: "PASSED" | "FAILED",
    confidence: number,
  ) => void;
  /** 포인트를 소모한다(지도 핀 다시 던지기 등). 잔액 부족하면 false, 성공하면 차감하고 true */
  spendPoints: (amount: number) => boolean;
  /** 핀 던지기 결과 등급을 기록해 천장 카운터를 갱신한다 (레어 이상이면 0으로 리셋) */
  recordThrowRarity: (rarity: Rarity) => void;
  /** 지도 도시에 대표 사진 1장 설정 (기존 사진 교체, 방문 자동 등록) */
  setCityPhoto: (cityId: string, url: string) => void;
  removeCityPhoto: (cityId: string, photoId: string) => void;
  setCityNote: (cityId: string, note: string) => void;
}

function newCityRecord(cityId: string, now: string): CityRecord {
  return {
    cityId,
    visitCount: 1,
    firstVisitAt: now,
    lastVisitAt: now,
    photos: [],
  };
}

/** 여행 완료 시 방문 횟수 +1 (기존 없으면 1로 생성) */
function touchCity(
  records: Record<string, CityRecord>,
  cityId: string,
): Record<string, CityRecord> {
  const now = new Date().toISOString();
  const existing = records[cityId];
  const next: CityRecord = existing
    ? { ...existing, visitCount: existing.visitCount + 1, lastVisitAt: now }
    : newCityRecord(cityId, now);
  return { ...records, [cityId]: next };
}

/** 도시 기록을 보장(없으면 방문 1로 생성, 있으면 그대로) — 사진 추가용 */
function ensureCity(
  records: Record<string, CityRecord>,
  cityId: string,
): Record<string, CityRecord> {
  if (records[cityId]) return records;
  return { ...records, [cityId]: newCityRecord(cityId, new Date().toISOString()) };
}

export const useMorgo = create<MorgoState>()(
  persist(
    (set, get) => ({
      // 로그인 없이 바로 기능을 쓸 수 있도록 기본값을 게스트로 시작 (명시적 로그아웃 시에만 null)
      user: { email: "", nickname: "게스트", isGuest: true },
      trips: [],
      bookingSeq: 1,
      spentPoints: 0,
      pityCount: 0,
      horrorMode: false,
      toggleHorrorMode: () => set({ horrorMode: !get().horrorMode }),
      cityRecords: {},

      login: (user) => set({ user }),
      logout: () => set({ user: null }),

      createTrip: (conditions) => {
        const plan = createTripPlan(conditions);
        if (!plan) return null;
        const id = `trip_${Date.now().toString(36)}`;
        const trip: Trip = {
          id,
          createdAt: new Date().toISOString(),
          status: "CONDITION_COMPLETED",
          conditions,
          cityId: plan.cityId,
          offerIds: plan.offerIds,
          choices: [],
        };
        set({ trips: [trip, ...get().trips] });
        return id;
      },

      createInstantTrip: (cityId, rarity) => {
        const city =
          (cityId ? getCity(cityId) : undefined) ??
          CITIES[Math.floor(Math.random() * CITIES.length)];
        const today = todayStr();
        const id = `trip_${Date.now().toString(36)}`;
        const trip: Trip = {
          id,
          createdAt: new Date().toISOString(),
          status: "REVEALED",
          conditions: {
            departure: DEPARTURE_PRESETS[0],
            checkInDate: today,
            checkOutDate: today,
            adultCount: 2,
            childCount: 0,
            infantCount: 0,
            petCount: 0,
            distanceRange: "ANY",
            maximumBudget: 0,
            accommodationTypes: [],
            requiredFacilities: [],
          },
          cityId: city.id,
          offerIds: [],
          choices: [],
          rarity,
          // 미션은 공개 화면 진입 시 AI가 그 자리에서 생성 (setTripMissions)
        };
        set({ trips: [trip, ...get().trips] });
        return id;
      },

      setChoices: (tripId, choices) =>
        set({
          trips: get().trips.map((t) =>
            t.id === tripId
              ? { ...t, choices, status: "ACCOMMODATION_SELECTED" }
              : t,
          ),
        }),

      confirmBooking: (tripId) => {
        const { trips, bookingSeq } = get();
        const trip = trips.find((t) => t.id === tripId);
        if (!trip || trip.booking) return;
        const first = [...trip.choices].sort(
          (a, b) => a.priority - b.priority,
        )[0];
        if (!first) return;
        // Phase 1: 테스트 재고는 항상 1순위 성공으로 시뮬레이션
        const booking = {
          bookingNumber: makeBookingNumber(
            trip.conditions.checkInDate,
            bookingSeq,
          ),
          totalAmount: 0,
          bookedAt: new Date().toISOString(),
          revealAt: revealAtOf(trip.conditions.checkInDate),
          isSimulation: true as const,
        };
        set({
          bookingSeq: bookingSeq + 1,
          trips: trips.map((t) =>
            t.id === tripId
              ? {
                  ...t,
                  status: "REVEAL_WAITING",
                  bookedAccommodationId: first.accommodationId,
                  booking,
                }
              : t,
          ),
        });
      },

      reveal: (tripId, opts) => {
        const trip = get().trips.find((t) => t.id === tripId);
        if (!trip || !trip.booking) return false;
        if (trip.status !== "REVEAL_WAITING") return trip.status === "REVEALED";
        const due = new Date(trip.booking.revealAt).getTime() <= Date.now();
        if (!due && !opts?.force) return false;
        set({
          trips: get().trips.map((t) =>
            t.id === tripId ? { ...t, status: "REVEALED" } : t,
          ),
        });
        return true;
      },

      cancelTrip: (tripId) =>
        set({
          trips: get().trips.map((t) =>
            t.id === tripId ? { ...t, status: "CANCELLED" } : t,
          ),
        }),

      completeTrip: (tripId) => {
        const { trips, cityRecords } = get();
        const trip = trips.find((t) => t.id === tripId);
        if (!trip || trip.status === "COMPLETED") return;
        set({
          trips: trips.map((t) =>
            t.id === tripId ? { ...t, status: "COMPLETED" } : t,
          ),
          cityRecords: touchCity(cityRecords, trip.cityId),
        });
      },

      setTripMissions: (tripId, missions) =>
        set({
          trips: get().trips.map((t) =>
            t.id === tripId && !(t.missions && t.missions.length > 0)
              ? { ...t, missions }
              : t,
          ),
        }),

      addTripMission: (tripId, mission) =>
        set({
          trips: get().trips.map((t) =>
            t.id === tripId
              ? {
                  ...t,
                  missions: [
                    ...(t.missions ?? []),
                    { mission, status: "ASSIGNED" as const },
                  ],
                }
              : t,
          ),
        }),

      submitMission: (tripId, missionId, imageUrl) =>
        set({
          trips: get().trips.map((t) =>
            t.id === tripId
              ? {
                  ...t,
                  missions: t.missions?.map((m) =>
                    m.mission.id === missionId
                      ? {
                          ...m,
                          status: "ANALYZING",
                          imageUrl,
                          submittedAt: new Date().toISOString(),
                        }
                      : m,
                  ),
                }
              : t,
          ),
        }),

      resolveMission: (tripId, missionId, status, confidence) =>
        set({
          trips: get().trips.map((t) =>
            t.id === tripId
              ? {
                  ...t,
                  missions: t.missions?.map((m) => {
                    if (m.mission.id !== missionId) return m;
                    // 통과 시점 이벤트가 포인트 배율이면 실제 지급 포인트에 반영 (예: "미션 포인트 2배" 주간)
                    const event = getCurrentEvent();
                    const earnedPoints =
                      status === "PASSED" && event.effect.type === "points"
                        ? Math.round(m.mission.points * event.effect.multiplier)
                        : m.mission.points;
                    return { ...m, status, confidence, earnedPoints };
                  }),
                }
              : t,
          ),
        }),

      spendPoints: (amount) => {
        const { trips, spentPoints } = get();
        const available = totalEarnedPoints(trips) - spentPoints;
        if (available < amount) return false;
        set({ spentPoints: spentPoints + amount });
        return true;
      },

      recordThrowRarity: (rarity) =>
        set({ pityCount: rarity === "common" ? get().pityCount + 1 : 0 }),

      setCityPhoto: (cityId, url) => {
        const records = ensureCity(get().cityRecords, cityId);
        const rec = records[cityId];
        const photo: CityPhoto = {
          id: `photo_${Date.now().toString(36)}`,
          url,
          addedAt: new Date().toISOString(),
        };
        // 도시당 대표 사진 1장 (교체)
        set({
          cityRecords: {
            ...records,
            [cityId]: { ...rec, photos: [photo] },
          },
        });
      },

      removeCityPhoto: (cityId, photoId) => {
        const rec = get().cityRecords[cityId];
        if (!rec) return;
        set({
          cityRecords: {
            ...get().cityRecords,
            [cityId]: {
              ...rec,
              photos: rec.photos.filter((p) => p.id !== photoId),
            },
          },
        });
      },

      setCityNote: (cityId, note) => {
        const rec = get().cityRecords[cityId];
        if (!rec) return;
        set({
          cityRecords: {
            ...get().cityRecords,
            [cityId]: { ...rec, note },
          },
        });
      },
    }),
    { name: "morgo-store" },
  ),
);

/** SSR 하이드레이션 안전 가드용 훅 */
import { useSyncExternalStore } from "react";
const noopSubscribe = () => () => {};
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
