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
  Departure,
  HorrorSpot,
  Mission,
  PlaceSpot,
  Rarity,
  Trip,
  TripChoice,
  TripConditions,
  TripMission,
  TripTheme,
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
  /** 현재 여행 테마 (첫 화면에서 선택 — 앱 색상 리스킨 + 룰렛/미션 톤). "normal"이면 기본 */
  theme: TripTheme;
  /** 첫 화면 테마 선택을 이미 마쳤는지 (false면 진입 시 선택 오버레이 노출) */
  themeChosen: boolean;
  setTheme: (theme: TripTheme) => void;
  /** 방문 도시 + 사진 기록 (명세서 15~16장) — cityId 키 */
  cityRecords: Record<string, CityRecord>;
  login: (user: User) => void;
  logout: () => void;
  /** 조건으로 여행 생성. 후보 도시가 없으면 null */
  createTrip: (conditions: TripConditions) => string | null;
  /** 예약 없이 즉석 랜덤 여행 생성 → 바로 공개(도착) 상태 + 미션 배정. cityId/rarity는 지도 핀 던지기 연출 결과.
   *  공포 모드 '공포 명소 소환'이면 소환된 명소(horrorSpot)를, 현재 위치를 잡았으면 출발지(departure)를 함께 넘긴다 */
  createInstantTrip: (
    cityId?: string,
    rarity?: Rarity,
    horrorSpot?: HorrorSpot,
    departure?: Departure,
  ) => string;
  setChoices: (tripId: string, choices: TripChoice[]) => void;
  /** 테스트 결제 + 가짜 예약 생성 (명세서 12장 시뮬레이션) */
  confirmBooking: (tripId: string) => void;
  /** 공개 시각 도달 시 상태 전환 + 미션 할당. 개발용 강제 공개 포함 */
  reveal: (tripId: string, opts?: { force?: boolean }) => boolean;
  cancelTrip: (tripId: string) => void;
  /** 여행 내역에서 완전히 삭제 (목록에서 제거) */
  deleteTrip: (tripId: string) => void;
  /** 모든 데이터 초기화 — 여행·방문기록·포인트를 전부 날린다 (유저/테마는 유지) */
  resetAll: () => void;
  /** 여행 완료 처리 → 방문 도시 등록 (명세서 15.3) */
  completeTrip: (tripId: string) => void;
  /** 체크아웃 날짜가 지난 진행 중 여행을 자동 종료.
   *  미션을 전부 성공했으면 COMPLETED(방문 기록 등록), 하나라도 못 했으면 FAILED */
  expireTrips: () => void;
  /** 도착 룰렛 결과를 여행 미션으로 추가 */
  addTripMission: (tripId: string, mission: Mission) => void;
  /** 친구 초대 방을 만든 뒤 그 코드를 여행에 저장 (재생성 방지) */
  setTripRoomCode: (tripId: string, roomCode: string) => void;
  /** 목적지 주변 추천 장소 저장 (계획형 트립, 1회 생성) */
  setTripNearby: (tripId: string, nearby: PlaceSpot[]) => void;
  /** AI가 생성한 시작 미션 세트를 저장 (공개 화면 마운트 시 1회). 공포 모드면 spot도 함께 저장 */
  setTripMissions: (
    tripId: string,
    missions: TripMission[],
    horrorSpot?: HorrorSpot,
  ) => void;
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
      theme: "normal",
      themeChosen: false,
      setTheme: (theme) => set({ theme, themeChosen: true }),
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
          theme: get().theme,
        };
        set({ trips: [trip, ...get().trips] });
        return id;
      },

      createInstantTrip: (cityId, rarity, horrorSpot, departure) => {
        const currentTheme = get().theme;
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
            // 현재 위치를 잡았으면 그 출발지, 못 잡았으면 프리셋
            departure: departure ?? DEPARTURE_PRESETS[0],
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
          // 미리 정해진 목적지(spot)를 테마에 맞는 필드로 저장.
          //  - 공포: horrorSpot (필수 방문 + 안전 경고 UI)
          //  - 부모/아이: themeSpot (그 관광지/체험관으로 가는 여행)
          // (없으면 공개 화면에서 AI가 찾음)
          horrorSpot: currentTheme === "horror" ? horrorSpot : undefined,
          themeSpot: currentTheme !== "horror" ? horrorSpot : undefined,
          // 생성 시점 테마를 여행에 고정 → 나중에 테마를 바꿔도 이 여행 미션 톤은 유지
          theme: currentTheme,
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

      deleteTrip: (tripId) =>
        set({ trips: get().trips.filter((t) => t.id !== tripId) }),

      resetAll: () =>
        set({
          trips: [],
          cityRecords: {},
          spentPoints: 0,
          pityCount: 0,
          bookingSeq: 1,
        }),

      completeTrip: (tripId) => {
        const { trips, cityRecords } = get();
        const trip = trips.find((t) => t.id === tripId);
        // 이미 끝난(완료/실패) 여행은 다시 완료 처리 불가
        if (!trip || trip.status === "COMPLETED" || trip.status === "FAILED") return;
        set({
          trips: trips.map((t) =>
            t.id === tripId ? { ...t, status: "COMPLETED" } : t,
          ),
          cityRecords: touchCity(cityRecords, trip.cityId),
        });
      },

      expireTrips: () => {
        const today = todayStr();
        const { trips, cityRecords } = get();
        let records = cityRecords;
        let changed = false;
        const next = trips.map((t): Trip => {
          if (t.status !== "REVEALED" && t.status !== "TRIP_IN_PROGRESS") return t;
          // YYYY-MM-DD 문자열 비교 — 체크아웃 당일까지는 진행 중, 다음날부터 종료
          if (t.conditions.checkOutDate >= today) return t;
          changed = true;
          const missions = t.missions ?? [];
          const allPassed =
            missions.length > 0 && missions.every((m) => m.status === "PASSED");
          if (allPassed) {
            records = touchCity(records, t.cityId);
            return { ...t, status: "COMPLETED" };
          }
          return { ...t, status: "FAILED" };
        });
        if (changed) set({ trips: next, cityRecords: records });
      },

      setTripRoomCode: (tripId, roomCode) =>
        set({
          trips: get().trips.map((t) =>
            t.id === tripId ? { ...t, roomCode } : t,
          ),
        }),

      setTripNearby: (tripId, nearby) =>
        set({
          trips: get().trips.map((t) =>
            t.id === tripId ? { ...t, nearby } : t,
          ),
        }),

      setTripMissions: (tripId, missions, horrorSpot) =>
        set({
          trips: get().trips.map((t) =>
            t.id === tripId && !(t.missions && t.missions.length > 0)
              ? { ...t, missions, horrorSpot }
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
    {
      name: "morgo-store",
      version: 1,
      // v0(불리언 horrorMode) → v1(theme enum) 마이그레이션
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown> | undefined;
        if (state && version < 1) {
          if (state.theme === undefined) {
            state.theme = state.horrorMode ? "horror" : "normal";
          }
          delete state.horrorMode;
          // 기존 유저는 이미 앱을 쓰던 사람 → 선택 오버레이로 다시 방해하지 않음
          if (state.themeChosen === undefined) state.themeChosen = true;
        }
        return state as unknown as MorgoState;
      },
    },
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
