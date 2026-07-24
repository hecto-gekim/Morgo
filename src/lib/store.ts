"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  assignTripMissions,
  createTripPlan,
  makeBookingNumber,
  revealAtOf,
  todayStr,
} from "./logic";
import { CITIES, DEPARTURE_PRESETS } from "./seed";
import type {
  CityPhoto,
  CityRecord,
  Mission,
  Trip,
  TripChoice,
  TripConditions,
  User,
} from "./types";

interface MorgoState {
  user: User | null;
  trips: Trip[];
  bookingSeq: number;
  /** 방문 도시 + 사진 기록 (명세서 15~16장) — cityId 키 */
  cityRecords: Record<string, CityRecord>;
  login: (user: User) => void;
  logout: () => void;
  /** 조건으로 여행 생성. 후보 도시가 없으면 null */
  createTrip: (conditions: TripConditions) => string | null;
  /** 예약 없이 즉석 랜덤 여행 생성 → 바로 공개(도착) 상태 + 미션 배정 */
  createInstantTrip: () => string;
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
      user: null,
      trips: [],
      bookingSeq: 1,
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

      createInstantTrip: () => {
        const city = CITIES[Math.floor(Math.random() * CITIES.length)];
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
          missions: assignTripMissions(city.id),
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
            t.id === tripId
              ? {
                  ...t,
                  status: "REVEALED",
                  // 공개 시점에 미션 할당 (이미 있으면 유지)
                  missions: t.missions ?? assignTripMissions(t.cityId),
                }
              : t,
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
                  missions: t.missions?.map((m) =>
                    m.mission.id === missionId
                      ? { ...m, status, confidence }
                      : m,
                  ),
                }
              : t,
          ),
        }),

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
import { useEffect, useState } from "react";
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
