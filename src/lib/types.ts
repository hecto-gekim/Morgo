// Morgo 도메인 타입 (Phase 1: UI 우선, 시드 데이터 기반)

export type DistanceRange =
  | "UNDER_100"
  | "FROM_100_TO_200"
  | "FROM_200_TO_300"
  | "OVER_300"
  | "ANY";

export const DISTANCE_RANGE_LABELS: Record<DistanceRange, string> = {
  UNDER_100: "100km 이내",
  FROM_100_TO_200: "100km ~ 200km",
  FROM_200_TO_300: "200km ~ 300km",
  OVER_300: "300km 이상",
  ANY: "거리 제한 없음",
};

export type AccommodationType =
  | "HOTEL"
  | "RESORT"
  | "PENSION"
  | "DOKCHAE"
  | "POOLVILLA"
  | "GUESTHOUSE"
  | "HANOK"
  | "CAMPING"
  | "GLAMPING";

export const ACCOMMODATION_TYPE_LABELS: Record<AccommodationType, string> = {
  HOTEL: "호텔",
  RESORT: "리조트",
  PENSION: "펜션",
  DOKCHAE: "독채",
  POOLVILLA: "풀빌라",
  GUESTHOUSE: "게스트하우스",
  HANOK: "한옥",
  CAMPING: "캠핑",
  GLAMPING: "글램핑",
};

export type Facility =
  | "PARKING"
  | "POOL"
  | "BBQ"
  | "JACUZZI"
  | "BATHTUB"
  | "BREAKFAST"
  | "PET"
  | "ELEVATOR"
  | "KITCHEN"
  | "WIFI"
  | "NON_SMOKING";

export const FACILITY_LABELS: Record<Facility, string> = {
  PARKING: "주차",
  POOL: "수영장",
  BBQ: "바비큐",
  JACUZZI: "자쿠지",
  BATHTUB: "욕조",
  BREAKFAST: "조식",
  PET: "반려동물 동반",
  ELEVATOR: "엘리베이터",
  KITCHEN: "취사 가능",
  WIFI: "와이파이",
  NON_SMOKING: "금연 객실",
};

export type TripStatus =
  | "DRAFT"
  | "CONDITION_COMPLETED"
  | "ACCOMMODATION_SELECTED"
  | "PAYMENT_PENDING"
  | "BOOKING_PROCESSING"
  | "BOOKING_CONFIRMED"
  | "REVEAL_WAITING"
  | "REVEALED"
  | "TRIP_IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  DRAFT: "작성 중",
  CONDITION_COMPLETED: "조건 입력 완료",
  ACCOMMODATION_SELECTED: "숙소 선택 완료",
  PAYMENT_PENDING: "결제 대기",
  BOOKING_PROCESSING: "예약 처리 중",
  BOOKING_CONFIRMED: "예약 완료",
  REVEAL_WAITING: "공개 대기",
  REVEALED: "목적지 공개",
  TRIP_IN_PROGRESS: "여행 중",
  COMPLETED: "여행 완료",
  CANCELLED: "취소됨",
};

export interface City {
  id: string;
  name: string;
  provinceName: string;
  officeLatitude: number;
  officeLongitude: number;
  /** 시·군·구 행정코드 (public/korea-sigungu.json 폴리곤과 매칭) */
  code: string;
}

/** 시드 숙소. 이름/주소 등은 블라인드 대상이며 공개 전 화면에 노출 금지 */
export interface Accommodation {
  id: string;
  cityId: string;
  /** 비공개: 공개 시점 이후에만 노출 */
  name: string;
  /** 비공개 */
  address: string;
  type: AccommodationType;
  blindTitle: string;
  blindDescription: string;
  roomSize: string;
  baseCapacity: number;
  maxCapacity: number;
  bedCount: number;
  bathCount: number;
  facilities: Facility[];
  checkInTime: string;
  checkOutTime: string;
  ratingBand: string;
  price: number;
  cancelPolicy: string;
  moodTags: string[];
  /** 블라인드 카드 placeholder 이미지 테마 (외부 이미지 없이 그라디언트로 표현) */
  imageTheme: { from: string; to: string; emoji: string };
}

export interface Departure {
  label: string;
  latitude: number;
  longitude: number;
}

export interface TripConditions {
  departure: Departure;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string;
  adultCount: number;
  childCount: number;
  infantCount: number;
  petCount: number;
  distanceRange: DistanceRange;
  maximumBudget: number;
  accommodationTypes: AccommodationType[];
  requiredFacilities: Facility[];
}

export interface TripChoice {
  accommodationId: string;
  priority: 1 | 2 | 3;
}

export interface Booking {
  bookingNumber: string;
  totalAmount: number;
  bookedAt: string; // ISO
  revealAt: string; // ISO
  isSimulation: true;
}

/** 핀 던지기 결과 등급 (변동 보상 연출용) */
export type Rarity = "common" | "rare" | "epic" | "legendary";

/** 공포 모드에서 AI가 실시간 검색으로 찾아낸, 이 도시의 실존(요즘 화제인) 공포 명소 */
export interface HorrorSpot {
  name: string;
  description: string;
}

export interface Trip {
  id: string;
  createdAt: string;
  status: TripStatus;
  conditions: TripConditions;
  /** 랜덤 선정된 도시 (공개 전 사용자 노출 금지) */
  cityId: string;
  /** 블라인드 후보 숙소 id 목록 */
  offerIds: string[];
  choices: TripChoice[];
  /** 예약 확정된 숙소 id (1순위 시뮬레이션 결과) */
  bookedAccommodationId?: string;
  booking?: Booking;
  /** 공개 시점에 할당되는 여행 미션 (명세서 17장, 3~5개) */
  missions?: TripMission[];
  /** 핀 던지기에서 나온 등급 (rare 이상이면 보너스 미션 추가) */
  rarity?: Rarity;
  /** 공포 모드로 공개된 여행이면, AI가 찾아낸 이 도시의 공포 명소 */
  horrorSpot?: HorrorSpot;
}

export interface User {
  email: string;
  nickname: string;
  /** 로그인 건너뛰기로 시작한 임시 사용자 (마이 페이지에서 나중에 로그인 가능) */
  isGuest?: boolean;
}

// ── 여행 미션 (명세서 17~18장) ──────────────────────────────

export type MissionCategory =
  | "OBJECT"
  | "LANDMARK"
  | "ACTION"
  | "DARE"
  | "PLACE"
  | "HORROR";

export const MISSION_CATEGORY_LABELS: Record<MissionCategory, string> = {
  OBJECT: "사물",
  LANDMARK: "관광지",
  ACTION: "행동",
  DARE: "병맛 도전",
  PLACE: "맛집·카페",
  HORROR: "괴담",
};

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  emoji: string;
  points: number;
  /** 도시 고정 미션이면 해당 도시 id (공통 미션은 undefined) */
  cityId?: string;
}

export type MissionStatus = "ASSIGNED" | "ANALYZING" | "PASSED" | "FAILED";

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  ASSIGNED: "도전 전",
  ANALYZING: "판정 중",
  PASSED: "성공",
  FAILED: "재도전",
};

/** 여행에 할당된 미션 + 제출 결과 */
export interface TripMission {
  mission: Mission;
  status: MissionStatus;
  /** 제출 사진 (다운스케일 dataURL) */
  imageUrl?: string;
  /** AI 판정 신뢰도 (명세서 18.3) — 시뮬레이션 값 */
  confidence?: number;
  submittedAt?: string; // ISO
  /** 실제 지급된 포인트 (통과 시점 이벤트 배율 반영). 없으면 mission.points 그대로 */
  earnedPoints?: number;
}

// ── 방문 도시 지도 + 사진 기록 (명세서 15~16장) ─────────────

export interface CityPhoto {
  id: string;
  /** 다운스케일된 dataURL */
  url: string;
  addedAt: string; // ISO
  caption?: string;
}

export interface CityRecord {
  cityId: string;
  visitCount: number;
  firstVisitAt: string; // ISO
  lastVisitAt: string; // ISO
  photos: CityPhoto[];
  note?: string;
}

// ── 홈 이벤트 (재미 요소) ───────────────────────────────────

/** 이벤트가 실제로 적용하는 효과 — reward 문구는 이 값과 반드시 일치해야 한다 */
export type EventEffect =
  | { type: "points"; multiplier: number }
  | { type: "rarity"; multiplier: number };

export interface MorgoEvent {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  /** 남은 시간 카운트다운 대상 */
  endsAt: string; // ISO
  reward: string;
  effect: EventEffect;
}
