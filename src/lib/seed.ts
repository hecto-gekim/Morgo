import type {
  Accommodation,
  City,
  Departure,
  Mission,
  TripTheme,
} from "./types";

// 출발지 프리셋 (Phase 1: 주소 검색 대신 프리셋 + 직접 입력 라벨)
export const DEPARTURE_PRESETS: Departure[] = [
  { label: "서울특별시청", latitude: 37.5665, longitude: 126.978 },
  { label: "부산광역시청", latitude: 35.1796, longitude: 129.0756 },
  { label: "대전광역시청", latitude: 36.3504, longitude: 127.3845 },
  { label: "대구광역시청", latitude: 35.8714, longitude: 128.6014 },
  { label: "광주광역시청", latitude: 35.1595, longitude: 126.8526 },
  { label: "인천광역시청", latitude: 37.4563, longitude: 126.7052 },
];

export const CITIES: City[] = [
  { id: "gangneung", name: "강릉시", provinceName: "강원특별자치도", officeLatitude: 37.7519, officeLongitude: 128.8761, code: "32030" },
  { id: "sokcho", name: "속초시", provinceName: "강원특별자치도", officeLatitude: 38.207, officeLongitude: 128.5918, code: "32060" },
  { id: "chuncheon", name: "춘천시", provinceName: "강원특별자치도", officeLatitude: 37.8813, officeLongitude: 127.73, code: "32010" },
  { id: "jeonju", name: "전주시", provinceName: "전북특별자치도", officeLatitude: 35.8242, officeLongitude: 127.148, code: "35010" },
  { id: "yeosu", name: "여수시", provinceName: "전라남도", officeLatitude: 34.7604, officeLongitude: 127.6622, code: "36020" },
  { id: "gyeongju", name: "경주시", provinceName: "경상북도", officeLatitude: 35.8562, officeLongitude: 129.2247, code: "37020" },
  { id: "tongyeong", name: "통영시", provinceName: "경상남도", officeLatitude: 34.8544, officeLongitude: 128.4331, code: "38050" },
  { id: "damyang", name: "담양군", provinceName: "전라남도", officeLatitude: 35.3211, officeLongitude: 126.9882, code: "36310" },
  { id: "taean", name: "태안군", provinceName: "충청남도", officeLatitude: 36.7456, officeLongitude: 126.2978, code: "34380" },
  { id: "jecheon", name: "제천시", provinceName: "충청북도", officeLatitude: 37.1326, officeLongitude: 128.191, code: "33030" },
];

// 시군구 코드 앞 2자리 → 시/도 (public/korea-sigungu.json 기준, 실측으로 확인)
const PROVINCE_BY_PREFIX: Record<string, string> = {
  "11": "서울특별시",
  "21": "부산광역시",
  "22": "대구광역시",
  "23": "인천광역시",
  "24": "광주광역시",
  "25": "대전광역시",
  "26": "울산광역시",
  "29": "세종특별자치시",
  "31": "경기도",
  "32": "강원특별자치도",
  "33": "충청북도",
  "34": "충청남도",
  "35": "전북특별자치도",
  "36": "전라남도",
  "37": "경상북도",
  "38": "경상남도",
  "39": "제주특별자치도",
};

function provinceOfCode(code: string): string {
  return PROVINCE_BY_PREFIX[code.slice(0, 2)] ?? "대한민국";
}

/** 구 단위로 쪼개져 있는 특별시/광역시 (서울 제외 — 서울은 뽑기 대상에서 아예 빠짐) */
const METRO_PREFIXES = ["21", "22", "23", "24", "25", "26"];
const EXCLUDED_PREFIXES = ["11"]; // 서울

/** 폴리곤 최대 링의 대략 중심 (경도, 위도) */
function ringCentroid(polys: [number, number][][]): { lat: number; lng: number } {
  let big = polys[0];
  for (const r of polys) if (r.length > big.length) big = r;
  let sLng = 0;
  let sLat = 0;
  for (const [lng, lat] of big) {
    sLng += lng;
    sLat += lat;
  }
  return { lat: sLat / big.length, lng: sLng / big.length };
}

/** 시드에 없는 전국 시군구(광역시는 구 단위 대신 시 전체로 뭉쳐서)를 담아두는 런타임 캐시 */
const REGION_CITY_CACHE = new Map<string, City>();

/**
 * 지도 폴리곤(korea-sigungu.json) 전체를 도시 레지스트리에 등록한다.
 * - 이미 시드에 있는 코드는 건드리지 않는다.
 * - 서울은 등록하지 않는다(핀/화살 뽑기 대상에서 제외).
 * - 부산·대구·인천·광주·대전·울산처럼 구 단위로 쪼개진 광역시는 "oo구"가 아니라
 *   광역시 전체를 시 단위 하나로 뭉쳐서 등록한다(좌표는 구들의 평균 중심).
 * - 그 외 시/군은 그대로 하나씩 등록한다.
 * 지도를 처음 불러오는 곳(useKoreaRegions)에서 1회 호출되며, 이후 getCity/getCityByCode가 전국 어디든 찾을 수 있게 된다.
 */
export function registerRegionsAsCities(
  regions: { code: string; name: string; polys: [number, number][][] }[],
): void {
  const metroGroups = new Map<string, { code: string; polys: [number, number][][] }[]>();

  for (const r of regions) {
    const prefix = r.code.slice(0, 2);
    if (EXCLUDED_PREFIXES.includes(prefix)) continue;
    if (METRO_PREFIXES.includes(prefix)) {
      if (!metroGroups.has(prefix)) metroGroups.set(prefix, []);
      metroGroups.get(prefix)!.push(r);
      continue;
    }
    if (CITIES.some((c) => c.code === r.code)) continue;
    if (REGION_CITY_CACHE.has(r.code)) continue;
    const { lat, lng } = ringCentroid(r.polys);
    REGION_CITY_CACHE.set(r.code, {
      id: r.code,
      name: r.name,
      provinceName: provinceOfCode(r.code),
      officeLatitude: lat,
      officeLongitude: lng,
      code: r.code,
    });
  }

  for (const [prefix, group] of metroGroups) {
    if (REGION_CITY_CACHE.has(prefix)) continue;
    const centers = group.map((g) => ringCentroid(g.polys));
    const lat = centers.reduce((s, c) => s + c.lat, 0) / centers.length;
    const lng = centers.reduce((s, c) => s + c.lng, 0) / centers.length;
    const fullName = provinceOfCode(prefix); // 예: "부산광역시"
    REGION_CITY_CACHE.set(prefix, {
      id: prefix,
      name: fullName.replace(/(광역시|특별시|특별자치시)$/, ""), // "부산"
      provinceName: fullName,
      officeLatitude: lat,
      officeLongitude: lng,
      code: prefix, // 2자리 코드 = KoreaMap에서 같은 접두사 전체를 하이라이트하는 신호
    });
  }
}

export function getCity(cityId: string): City | undefined {
  return CITIES.find((c) => c.id === cityId) ?? REGION_CITY_CACHE.get(cityId);
}

/** 행정코드 → 도시 (시드 우선, 없으면 전국 캐시에서 찾음. 폴리곤 클릭/핀 던지기 연결용) */
export function getCityByCode(code: string): City | undefined {
  return CITIES.find((c) => c.code === code) ?? REGION_CITY_CACHE.get(code);
}

/** "도명 시명" 표기 도우미 — 부산처럼 시명이 도명에 이미 포함되면 중복 없이 도명만 보여준다 */
export function cityLabel(city: Pick<City, "name" | "provinceName">): string {
  if (city.provinceName.startsWith(city.name)) return city.provinceName;
  return `${city.provinceName} ${city.name}`;
}

/** 핀/화살 뽑기 대상 전체 (시드 10곳 + 전국 캐시, 서울 제외·광역시는 시 단위로 뭉쳐짐) */
export function getThrowablePool(): City[] {
  return [...CITIES, ...REGION_CITY_CACHE.values()];
}

// 검색 결과의 도/광역시 표기(줄임말·구명칭 포함)를 레지스트리 정식 명칭으로 정규화
const PROVINCE_ALIASES: Record<string, string> = {
  서울: "서울특별시", 서울시: "서울특별시",
  부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
  광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시",
  세종: "세종특별자치시", 세종시: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도", 강원도: "강원특별자치도",
  충북: "충청북도", 충남: "충청남도",
  전북: "전북특별자치도", 전라북도: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도", 경남: "경상남도",
  제주: "제주특별자치도", 제주도: "제주특별자치도",
};

/** 도/광역시 명칭의 핵심부만 남긴다(비교용). "충청남도"→"충청남", "부산광역시"→"부산" */
function provinceCore(p: string): string {
  return p.replace(/\s/g, "").replace(/(특별자치도|특별자치시|특별시|광역시|자치도|도|시)$/g, "");
}

function normalizeProvince(p: string): string {
  const t = (p ?? "").replace(/\s/g, "");
  return PROVINCE_ALIASES[t] ?? t;
}

/**
 * 검색으로 나온 공포 명소의 소재지(도/광역시 + 시·군·구)를 뽑기 풀의 실제 도시로 매칭한다.
 * 레지스트리가 로드된 클라이언트에서 호출해야 전국 시군구를 찾을 수 있다.
 * 광역시는 구 단위 대신 시 전체로 뭉쳐 있으므로 도(광역시)만 맞으면 매칭한다.
 */
export function findCityByRegion(
  province: string,
  cityName: string,
): City | undefined {
  const prov = normalizeProvince(province);
  const provCore = provinceCore(prov);
  const isMetro = /(특별시|광역시|특별자치시)$/.test(prov);
  const nm = (cityName ?? "").replace(/\s/g, "");
  const nmCore = nm.replace(/(시|군|구)$/g, "");

  return getThrowablePool().find((c) => {
    if (provinceCore(c.provinceName) !== provCore) return false;
    if (isMetro) return true; // 광역시 전체가 뽑기 풀에서 하나의 도시
    if (!nm) return false;
    const cn = c.name.replace(/\s/g, "");
    const cnCore = cn.replace(/(시|군|구)$/g, "");
    return cn === nm || cnCore === nmCore || cn.startsWith(nm) || nm.startsWith(cn);
  });
}

// 도시별 시드 숙소 (Phase 2에서 네이버 지역 검색 API + 관리자 검수로 대체)
export const ACCOMMODATIONS: Accommodation[] = [
  // 강릉
  {
    id: "acc-gn-1", cityId: "gangneung", name: "세인트존스 호텔", address: "강원특별자치도 강릉시 창해로 307",
    type: "HOTEL", blindTitle: "바다 전망 대형 호텔", blindDescription: "객실에서 일출을 볼 수 있는 오션뷰 호텔입니다. 산책하기 좋은 해변이 바로 앞에 있어요.",
    roomSize: "26㎡", baseCapacity: 2, maxCapacity: 3, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "WIFI", "BREAKFAST", "ELEVATOR", "NON_SMOKING", "BATHTUB"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.5 ~ 4.7", price: 145000,
    cancelPolicy: "체크인 3일 전까지 무료 취소", moodTags: ["오션뷰", "일출", "감성"],
    imageTheme: { from: "#3b82f6", to: "#06b6d4", emoji: "🌊" },
  },
  {
    id: "acc-gn-2", cityId: "gangneung", name: "강릉 소나무숲 펜션", address: "강원특별자치도 강릉시 연곡면 해변길 12",
    type: "PENSION", blindTitle: "숲속 바비큐 펜션", blindDescription: "소나무 숲에 둘러싸인 조용한 펜션. 테라스에서 바비큐를 즐길 수 있습니다.",
    roomSize: "33㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "WIFI", "BBQ", "KITCHEN", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.3 ~ 4.5", price: 98000,
    cancelPolicy: "체크인 5일 전까지 무료 취소", moodTags: ["숲속", "바비큐", "조용한"],
    imageTheme: { from: "#16a34a", to: "#84cc16", emoji: "🌲" },
  },
  {
    id: "acc-gn-3", cityId: "gangneung", name: "안목 스테이", address: "강원특별자치도 강릉시 창해로14번길 20",
    type: "GUESTHOUSE", blindTitle: "카페거리 감성 게스트하우스", blindDescription: "유명 카페거리 도보 거리의 아늑한 게스트하우스. 루프탑에서 바다가 보여요.",
    roomSize: "18㎡", baseCapacity: 2, maxCapacity: 2, bedCount: 1, bathCount: 1,
    facilities: ["WIFI", "NON_SMOKING", "ELEVATOR"],
    checkInTime: "16:00", checkOutTime: "11:00", ratingBand: "4.6 ~ 4.8", price: 65000,
    cancelPolicy: "체크인 3일 전까지 무료 취소", moodTags: ["카페", "루프탑", "가성비"],
    imageTheme: { from: "#f59e0b", to: "#f97316", emoji: "☕" },
  },
  // 속초
  {
    id: "acc-sc-1", cityId: "sokcho", name: "속초 마리나 리조트", address: "강원특별자치도 속초시 해오름로 100",
    type: "RESORT", blindTitle: "산과 바다 사이 리조트", blindDescription: "한쪽엔 산, 한쪽엔 바다가 보이는 대형 리조트. 실내 수영장이 있습니다.",
    roomSize: "42㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 2, bathCount: 1,
    facilities: ["PARKING", "WIFI", "POOL", "BREAKFAST", "ELEVATOR", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.4 ~ 4.6", price: 189000,
    cancelPolicy: "체크인 7일 전까지 무료 취소", moodTags: ["수영장", "가족", "마운틴뷰"],
    imageTheme: { from: "#0ea5e9", to: "#6366f1", emoji: "🏔️" },
  },
  {
    id: "acc-sc-2", cityId: "sokcho", name: "속초 온천 독채", address: "강원특별자치도 속초시 관광로 45",
    type: "DOKCHAE", blindTitle: "프라이빗 자쿠지 독채", blindDescription: "단독 마당과 자쿠지가 있는 독채 숙소. 오붓한 여행에 좋아요.",
    roomSize: "56㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 2, bathCount: 2,
    facilities: ["PARKING", "WIFI", "JACUZZI", "KITCHEN", "BBQ", "PET"],
    checkInTime: "16:00", checkOutTime: "11:00", ratingBand: "4.7 ~ 4.9", price: 240000,
    cancelPolicy: "체크인 7일 전까지 무료 취소", moodTags: ["프라이빗", "자쿠지", "반려동물"],
    imageTheme: { from: "#8b5cf6", to: "#ec4899", emoji: "🛁" },
  },
  {
    id: "acc-sc-3", cityId: "sokcho", name: "설악 게스트하우스", address: "강원특별자치도 속초시 번영로 12",
    type: "GUESTHOUSE", blindTitle: "시장 골목 게스트하우스", blindDescription: "유명 전통시장 도보 5분. 먹거리 여행에 최적화된 위치입니다.",
    roomSize: "16㎡", baseCapacity: 2, maxCapacity: 2, bedCount: 1, bathCount: 1,
    facilities: ["WIFI", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "10:30", ratingBand: "4.2 ~ 4.4", price: 55000,
    cancelPolicy: "체크인 2일 전까지 무료 취소", moodTags: ["시장", "먹방", "가성비"],
    imageTheme: { from: "#ef4444", to: "#f97316", emoji: "🍜" },
  },
  // 춘천
  {
    id: "acc-cc-1", cityId: "chuncheon", name: "레이크사이드 춘천", address: "강원특별자치도 춘천시 호반로 77",
    type: "HOTEL", blindTitle: "호수 전망 호텔", blindDescription: "잔잔한 호수가 내려다보이는 호텔. 아침 물안개가 인상적입니다.",
    roomSize: "28㎡", baseCapacity: 2, maxCapacity: 3, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "WIFI", "BREAKFAST", "ELEVATOR", "NON_SMOKING", "BATHTUB"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.4 ~ 4.6", price: 120000,
    cancelPolicy: "체크인 3일 전까지 무료 취소", moodTags: ["호수뷰", "물안개", "감성"],
    imageTheme: { from: "#06b6d4", to: "#3b82f6", emoji: "🌫️" },
  },
  {
    id: "acc-cc-2", cityId: "chuncheon", name: "강변 글램핑 춘천", address: "강원특별자치도 춘천시 남산면 강변길 8",
    type: "GLAMPING", blindTitle: "강변 감성 글램핑", blindDescription: "강가 바로 옆 글램핑. 밤에는 모닥불과 별을 즐길 수 있어요.",
    roomSize: "24㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "BBQ", "KITCHEN", "PET"],
    checkInTime: "14:00", checkOutTime: "11:00", ratingBand: "4.3 ~ 4.5", price: 110000,
    cancelPolicy: "체크인 5일 전까지 무료 취소", moodTags: ["글램핑", "모닥불", "별보기"],
    imageTheme: { from: "#0f766e", to: "#22c55e", emoji: "⛺" },
  },
  {
    id: "acc-cc-3", cityId: "chuncheon", name: "춘천 한옥별서", address: "강원특별자치도 춘천시 신북읍 한옥길 3",
    type: "HANOK", blindTitle: "고즈넉한 한옥 스테이", blindDescription: "전통 한옥의 대청마루에서 여유를 즐기는 숙소. 툇마루 커피가 명물입니다.",
    roomSize: "30㎡", baseCapacity: 2, maxCapacity: 3, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "WIFI", "KITCHEN", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.6 ~ 4.8", price: 130000,
    cancelPolicy: "체크인 5일 전까지 무료 취소", moodTags: ["한옥", "전통", "고즈넉"],
    imageTheme: { from: "#a16207", to: "#dc2626", emoji: "🏯" },
  },
  // 전주
  {
    id: "acc-jj-1", cityId: "jeonju", name: "전주 한옥마을 스테이", address: "전북특별자치도 전주시 완산구 한옥길 22",
    type: "HANOK", blindTitle: "돌담길 한옥 스테이", blindDescription: "돌담길 안쪽의 전통 한옥. 아궁이 온돌방에서 하룻밤을 보낼 수 있어요.",
    roomSize: "26㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 1, bathCount: 1,
    facilities: ["WIFI", "KITCHEN", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.5 ~ 4.7", price: 115000,
    cancelPolicy: "체크인 3일 전까지 무료 취소", moodTags: ["한옥", "온돌", "전통"],
    imageTheme: { from: "#b45309", to: "#78350f", emoji: "🏮" },
  },
  {
    id: "acc-jj-2", cityId: "jeonju", name: "전주 시티 호텔", address: "전북특별자치도 전주시 완산구 충경로 50",
    type: "HOTEL", blindTitle: "구도심 모던 호텔", blindDescription: "먹거리 골목까지 도보권인 모던한 호텔. 조식 뷔페가 유명합니다.",
    roomSize: "24㎡", baseCapacity: 2, maxCapacity: 2, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "WIFI", "BREAKFAST", "ELEVATOR", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "12:00", ratingBand: "4.3 ~ 4.5", price: 88000,
    cancelPolicy: "체크인 2일 전까지 무료 취소", moodTags: ["먹방", "도심", "조식"],
    imageTheme: { from: "#64748b", to: "#334155", emoji: "🏙️" },
  },
  {
    id: "acc-jj-3", cityId: "jeonju", name: "완산 풀빌라", address: "전북특별자치도 전주시 완산구 남고산성길 9",
    type: "POOLVILLA", blindTitle: "야경 온수풀 풀빌라", blindDescription: "도시 야경이 보이는 언덕 위 풀빌라. 사계절 온수풀을 운영합니다.",
    roomSize: "60㎡", baseCapacity: 2, maxCapacity: 6, bedCount: 2, bathCount: 2,
    facilities: ["PARKING", "WIFI", "POOL", "BBQ", "KITCHEN", "JACUZZI"],
    checkInTime: "16:00", checkOutTime: "11:00", ratingBand: "4.7 ~ 4.9", price: 290000,
    cancelPolicy: "체크인 7일 전까지 무료 취소", moodTags: ["풀빌라", "야경", "온수풀"],
    imageTheme: { from: "#7c3aed", to: "#2563eb", emoji: "🏊" },
  },
  // 여수
  {
    id: "acc-ys-1", cityId: "yeosu", name: "여수 밤바다 호텔", address: "전라남도 여수시 하멜로 30",
    type: "HOTEL", blindTitle: "야경 맛집 오션뷰 호텔", blindDescription: "밤이 되면 창밖으로 반짝이는 바다 야경이 펼쳐지는 호텔입니다.",
    roomSize: "27㎡", baseCapacity: 2, maxCapacity: 3, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "WIFI", "BREAKFAST", "ELEVATOR", "NON_SMOKING", "BATHTUB"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.5 ~ 4.7", price: 135000,
    cancelPolicy: "체크인 3일 전까지 무료 취소", moodTags: ["야경", "오션뷰", "로맨틱"],
    imageTheme: { from: "#1e3a8a", to: "#0ea5e9", emoji: "🌃" },
  },
  {
    id: "acc-ys-2", cityId: "yeosu", name: "돌산 독채 스테이", address: "전라남도 여수시 돌산읍 무술목길 14",
    type: "DOKCHAE", blindTitle: "섬마을 프라이빗 독채", blindDescription: "조용한 바닷가 마을의 독채. 마당에서 바비큐와 불멍이 가능합니다.",
    roomSize: "48㎡", baseCapacity: 2, maxCapacity: 5, bedCount: 2, bathCount: 1,
    facilities: ["PARKING", "WIFI", "BBQ", "KITCHEN", "PET", "BATHTUB"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.6 ~ 4.8", price: 175000,
    cancelPolicy: "체크인 5일 전까지 무료 취소", moodTags: ["프라이빗", "불멍", "바닷마을"],
    imageTheme: { from: "#0d9488", to: "#0284c7", emoji: "🏝️" },
  },
  {
    id: "acc-ys-3", cityId: "yeosu", name: "여수 캠핑 파크", address: "전라남도 여수시 소라면 해안도로 88",
    type: "CAMPING", blindTitle: "해안 캠핑 사이트", blindDescription: "파도 소리를 들으며 잠드는 해안가 캠핑장. 장비 대여가 가능합니다.",
    roomSize: "사이트 40㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 0, bathCount: 1,
    facilities: ["PARKING", "BBQ", "PET"],
    checkInTime: "14:00", checkOutTime: "12:00", ratingBand: "4.1 ~ 4.3", price: 45000,
    cancelPolicy: "체크인 2일 전까지 무료 취소", moodTags: ["캠핑", "파도소리", "가성비"],
    imageTheme: { from: "#166534", to: "#065f46", emoji: "🏕️" },
  },
  // 경주
  {
    id: "acc-gj-1", cityId: "gyeongju", name: "경주 고분뷰 한옥", address: "경상북도 경주시 첨성로 81",
    type: "HANOK", blindTitle: "역사 도시 한옥 스테이", blindDescription: "창문 너머로 오래된 유적이 보이는 특별한 한옥 숙소입니다.",
    roomSize: "28㎡", baseCapacity: 2, maxCapacity: 3, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "WIFI", "NON_SMOKING", "BATHTUB"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.7 ~ 4.9", price: 160000,
    cancelPolicy: "체크인 5일 전까지 무료 취소", moodTags: ["역사", "뷰맛집", "한옥"],
    imageTheme: { from: "#ca8a04", to: "#92400e", emoji: "🕰️" },
  },
  {
    id: "acc-gj-2", cityId: "gyeongju", name: "보문 리조트", address: "경상북도 경주시 보문로 424",
    type: "RESORT", blindTitle: "호반 대형 리조트", blindDescription: "호수 옆 대형 리조트. 자전거 대여와 산책로가 잘 되어 있어요.",
    roomSize: "45㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 2, bathCount: 1,
    facilities: ["PARKING", "WIFI", "POOL", "BREAKFAST", "ELEVATOR", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.3 ~ 4.5", price: 155000,
    cancelPolicy: "체크인 7일 전까지 무료 취소", moodTags: ["호수", "자전거", "가족"],
    imageTheme: { from: "#2563eb", to: "#7c3aed", emoji: "🚲" },
  },
  {
    id: "acc-gj-3", cityId: "gyeongju", name: "황리단 게스트하우스", address: "경상북도 경주시 포석로 120",
    type: "GUESTHOUSE", blindTitle: "핫플 골목 게스트하우스", blindDescription: "감성 카페와 소품샵이 가득한 골목에 있는 게스트하우스입니다.",
    roomSize: "17㎡", baseCapacity: 2, maxCapacity: 2, bedCount: 1, bathCount: 1,
    facilities: ["WIFI", "NON_SMOKING"],
    checkInTime: "16:00", checkOutTime: "11:00", ratingBand: "4.4 ~ 4.6", price: 60000,
    cancelPolicy: "체크인 3일 전까지 무료 취소", moodTags: ["핫플", "카페", "소품샵"],
    imageTheme: { from: "#db2777", to: "#f59e0b", emoji: "🧁" },
  },
  // 통영
  {
    id: "acc-ty-1", cityId: "tongyeong", name: "통영 바다뷰 리조트", address: "경상남도 통영시 도남로 200",
    type: "RESORT", blindTitle: "다도해 전망 리조트", blindDescription: "크고 작은 섬들이 점점이 떠 있는 바다 전망의 리조트입니다.",
    roomSize: "40㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 2, bathCount: 1,
    facilities: ["PARKING", "WIFI", "POOL", "BREAKFAST", "ELEVATOR", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.4 ~ 4.6", price: 165000,
    cancelPolicy: "체크인 7일 전까지 무료 취소", moodTags: ["섬뷰", "케이블카", "가족"],
    imageTheme: { from: "#0891b2", to: "#1d4ed8", emoji: "⛴️" },
  },
  {
    id: "acc-ty-2", cityId: "tongyeong", name: "동피랑 게스트하우스", address: "경상남도 통영시 동피랑길 12",
    type: "GUESTHOUSE", blindTitle: "벽화마을 언덕 게스트하우스", blindDescription: "알록달록한 벽화 골목 언덕 위의 게스트하우스. 항구가 내려다보여요.",
    roomSize: "18㎡", baseCapacity: 2, maxCapacity: 2, bedCount: 1, bathCount: 1,
    facilities: ["WIFI", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.3 ~ 4.5", price: 52000,
    cancelPolicy: "체크인 2일 전까지 무료 취소", moodTags: ["벽화", "항구뷰", "가성비"],
    imageTheme: { from: "#f43f5e", to: "#fb923c", emoji: "🎨" },
  },
  {
    id: "acc-ty-3", cityId: "tongyeong", name: "미륵도 풀빌라", address: "경상남도 통영시 미륵도길 55",
    type: "POOLVILLA", blindTitle: "선셋 인피니티 풀빌라", blindDescription: "노을 지는 바다와 이어지는 인피니티풀이 있는 풀빌라입니다.",
    roomSize: "58㎡", baseCapacity: 2, maxCapacity: 6, bedCount: 2, bathCount: 2,
    facilities: ["PARKING", "WIFI", "POOL", "BBQ", "KITCHEN", "JACUZZI"],
    checkInTime: "16:00", checkOutTime: "11:00", ratingBand: "4.8 ~ 5.0", price: 320000,
    cancelPolicy: "체크인 7일 전까지 무료 취소", moodTags: ["노을", "인피니티풀", "럭셔리"],
    imageTheme: { from: "#ea580c", to: "#9333ea", emoji: "🌅" },
  },
  // 담양
  {
    id: "acc-dy-1", cityId: "damyang", name: "죽녹원 한옥스테이", address: "전라남도 담양군 담양읍 죽향문화로 30",
    type: "HANOK", blindTitle: "대나무숲 옆 한옥", blindDescription: "바람이 불면 대나무 잎 소리가 들리는 고요한 한옥 숙소입니다.",
    roomSize: "25㎡", baseCapacity: 2, maxCapacity: 3, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "WIFI", "NON_SMOKING", "KITCHEN"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.6 ~ 4.8", price: 125000,
    cancelPolicy: "체크인 5일 전까지 무료 취소", moodTags: ["대나무", "힐링", "고요"],
    imageTheme: { from: "#15803d", to: "#4d7c0f", emoji: "🎋" },
  },
  {
    id: "acc-dy-2", cityId: "damyang", name: "메타세쿼이아 펜션", address: "전라남도 담양군 담양읍 메타세쿼이아로 55",
    type: "PENSION", blindTitle: "가로수길 근처 펜션", blindDescription: "유명한 가로수길 근처의 아늑한 펜션. 자전거 여행에 좋습니다.",
    roomSize: "30㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "WIFI", "BBQ", "KITCHEN", "PET"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.3 ~ 4.5", price: 95000,
    cancelPolicy: "체크인 3일 전까지 무료 취소", moodTags: ["가로수길", "자전거", "피크닉"],
    imageTheme: { from: "#65a30d", to: "#ca8a04", emoji: "🍃" },
  },
  {
    id: "acc-dy-3", cityId: "damyang", name: "담양 글램핑 힐", address: "전라남도 담양군 금성면 언덕길 7",
    type: "GLAMPING", blindTitle: "언덕 위 별보기 글램핑", blindDescription: "불빛이 적어 별이 잘 보이는 언덕 위 글램핑장입니다.",
    roomSize: "22㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "BBQ", "PET"],
    checkInTime: "14:00", checkOutTime: "11:00", ratingBand: "4.2 ~ 4.4", price: 105000,
    cancelPolicy: "체크인 5일 전까지 무료 취소", moodTags: ["별보기", "불멍", "언덕"],
    imageTheme: { from: "#1e293b", to: "#4338ca", emoji: "✨" },
  },
  // 태안
  {
    id: "acc-ta-1", cityId: "taean", name: "태안 선셋 풀빌라", address: "충청남도 태안군 안면읍 노을길 21",
    type: "POOLVILLA", blindTitle: "서해 노을 풀빌라", blindDescription: "수평선으로 지는 노을을 풀에서 감상할 수 있는 숙소입니다.",
    roomSize: "55㎡", baseCapacity: 2, maxCapacity: 6, bedCount: 2, bathCount: 2,
    facilities: ["PARKING", "WIFI", "POOL", "BBQ", "KITCHEN", "JACUZZI"],
    checkInTime: "16:00", checkOutTime: "11:00", ratingBand: "4.6 ~ 4.8", price: 270000,
    cancelPolicy: "체크인 7일 전까지 무료 취소", moodTags: ["노을", "풀빌라", "서해"],
    imageTheme: { from: "#f97316", to: "#be185d", emoji: "🌇" },
  },
  {
    id: "acc-ta-2", cityId: "taean", name: "몽산포 캠핑장", address: "충청남도 태안군 남면 몽산포길 18",
    type: "CAMPING", blindTitle: "솔숲 해변 캠핑", blindDescription: "솔숲과 넓은 백사장 사이의 캠핑장. 갯벌 체험도 가능합니다.",
    roomSize: "사이트 36㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 0, bathCount: 1,
    facilities: ["PARKING", "BBQ", "PET"],
    checkInTime: "14:00", checkOutTime: "12:00", ratingBand: "4.0 ~ 4.2", price: 40000,
    cancelPolicy: "체크인 2일 전까지 무료 취소", moodTags: ["솔숲", "갯벌", "가성비"],
    imageTheme: { from: "#0f766e", to: "#a16207", emoji: "🦀" },
  },
  {
    id: "acc-ta-3", cityId: "taean", name: "안면도 펜션", address: "충청남도 태안군 안면읍 해수욕장길 40",
    type: "PENSION", blindTitle: "해수욕장 앞 펜션", blindDescription: "해변까지 도보 3분 거리의 펜션. 온 가족이 머물기 좋아요.",
    roomSize: "34㎡", baseCapacity: 2, maxCapacity: 5, bedCount: 2, bathCount: 1,
    facilities: ["PARKING", "WIFI", "BBQ", "KITCHEN", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.2 ~ 4.4", price: 85000,
    cancelPolicy: "체크인 3일 전까지 무료 취소", moodTags: ["해변", "가족", "바비큐"],
    imageTheme: { from: "#0284c7", to: "#fbbf24", emoji: "🏖️" },
  },
  // 제천
  {
    id: "acc-jc-1", cityId: "jecheon", name: "청풍호 리조트", address: "충청북도 제천시 청풍면 호반로 10",
    type: "RESORT", blindTitle: "산정호수 전망 리조트", blindDescription: "산으로 둘러싸인 큰 호수가 보이는 리조트. 케이블카가 근처에 있어요.",
    roomSize: "38㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 2, bathCount: 1,
    facilities: ["PARKING", "WIFI", "BREAKFAST", "ELEVATOR", "NON_SMOKING", "BATHTUB"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.3 ~ 4.5", price: 140000,
    cancelPolicy: "체크인 5일 전까지 무료 취소", moodTags: ["호수뷰", "케이블카", "산"],
    imageTheme: { from: "#065f46", to: "#0369a1", emoji: "🚠" },
  },
  {
    id: "acc-jc-2", cityId: "jecheon", name: "제천 힐링 독채", address: "충청북도 제천시 봉양읍 산골길 5",
    type: "DOKCHAE", blindTitle: "산골 힐링 독채", blindDescription: "산자락 아래 조용한 독채. 마당 평상에서 별을 보며 쉬어가세요.",
    roomSize: "50㎡", baseCapacity: 2, maxCapacity: 4, bedCount: 2, bathCount: 1,
    facilities: ["PARKING", "WIFI", "BBQ", "KITCHEN", "PET", "JACUZZI"],
    checkInTime: "15:00", checkOutTime: "11:00", ratingBand: "4.5 ~ 4.7", price: 150000,
    cancelPolicy: "체크인 5일 전까지 무료 취소", moodTags: ["산골", "별보기", "힐링"],
    imageTheme: { from: "#374151", to: "#065f46", emoji: "🌌" },
  },
  {
    id: "acc-jc-3", cityId: "jecheon", name: "의림지 호텔", address: "충청북도 제천시 의림대로 66",
    type: "HOTEL", blindTitle: "저수지 산책 호텔", blindDescription: "유서 깊은 저수지 산책로 근처의 깔끔한 호텔입니다.",
    roomSize: "24㎡", baseCapacity: 2, maxCapacity: 2, bedCount: 1, bathCount: 1,
    facilities: ["PARKING", "WIFI", "ELEVATOR", "NON_SMOKING"],
    checkInTime: "15:00", checkOutTime: "12:00", ratingBand: "4.1 ~ 4.3", price: 78000,
    cancelPolicy: "체크인 2일 전까지 무료 취소", moodTags: ["산책", "조용한", "가성비"],
    imageTheme: { from: "#475569", to: "#0e7490", emoji: "🚶" },
  },
];

export function getAccommodation(id: string): Accommodation | undefined {
  return ACCOMMODATIONS.find((a) => a.id === id);
}

// ── 도시 부가정보 (공개 화면 + 도시 고정 미션용) ─────────────
export interface CityExtra {
  /** 대표 관광지 */
  landmark: string;
  landmarkEmoji: string;
  /** 지역 대표 음식 */
  food: string;
  /** 공개 후 노출되는 한 줄 소개 */
  intro: string;
}

export const CITY_EXTRAS: Record<string, CityExtra> = {
  gangneung: { landmark: "경포대", landmarkEmoji: "🌅", food: "초당순두부", intro: "커피와 파도, 동해의 감성 도시" },
  sokcho: { landmark: "속초등대전망대", landmarkEmoji: "🗼", food: "닭강정", intro: "설악산과 바다를 한 번에" },
  chuncheon: { landmark: "남이섬", landmarkEmoji: "🌳", food: "닭갈비", intro: "호수 위 물안개의 도시" },
  jeonju: { landmark: "전주한옥마을", landmarkEmoji: "🏘️", food: "전주비빔밥", intro: "골목마다 이어지는 맛과 멋" },
  yeosu: { landmark: "여수해상케이블카", landmarkEmoji: "🚠", food: "게장백반", intro: "밤바다가 반짝이는 항구" },
  gyeongju: { landmark: "첨성대", landmarkEmoji: "🏛️", food: "황남빵", intro: "천 년 신라가 잠든 노천 박물관" },
  tongyeong: { landmark: "동피랑 벽화마을", landmarkEmoji: "🎨", food: "충무김밥", intro: "한려수도의 다도해 전망" },
  damyang: { landmark: "죽녹원", landmarkEmoji: "🎋", food: "대통밥", intro: "대나무 바람이 부는 힐링 도시" },
  taean: { landmark: "꽃지해수욕장", landmarkEmoji: "🌇", food: "게국지", intro: "서해로 지는 노을 맛집" },
  jecheon: { landmark: "청풍호반케이블카", landmarkEmoji: "🚡", food: "빨간오뎅", intro: "산과 호수가 어우러진 약초의 고장" },
};

export function getCityExtra(cityId: string): CityExtra | undefined {
  return CITY_EXTRAS[cityId];
}

// ── 여행 미션 카탈로그 (명세서 17.2) ─────────────────────────
// 관광지(LANDMARK) 미션은 도시별로 동적 생성, 나머지는 AI가 매번 새로 만든다(roulette-ai).

/** 도시 고정 관광지 미션 (CITY_EXTRAS 기반 동적 생성) */
export function landmarkMissionOf(cityId: string): Mission | null {
  const extra = CITY_EXTRAS[cityId];
  if (!extra) return null;
  return {
    id: `land-${cityId}`,
    title: `${extra.landmark} 인증샷`,
    description: `이 도시의 대표 관광지 ${extra.landmark}을(를) 배경으로 찍어보세요.`,
    category: "LANDMARK",
    emoji: extra.landmarkEmoji,
    points: 30,
    cityId,
  };
}

// ── 대한민국 외곽선 (지도 배경용, 시계방향 coarse 좌표) ────────
// [경도, 위도]. logic.projectKorea 와 동일한 bounds 로 투영된다.
export const KOREA_OUTLINE: [number, number][] = [
  [126.5, 37.75], [126.95, 38.05], [127.8, 38.3], [128.36, 38.62],
  [129.0, 37.5], [129.43, 36.05], [129.36, 35.5], [129.2, 35.15],
  [128.9, 35.08], [128.4, 34.85], [127.8, 34.75], [127.4, 34.6],
  [126.9, 34.55], [126.5, 34.29], [126.38, 34.55], [126.45, 35.05],
  [126.55, 35.5], [126.7, 36.0], [126.3, 36.5], [126.4, 36.85],
  [126.7, 37.0], [126.45, 37.42], [126.6, 37.6], [126.5, 37.75],
];

/** 제주도 (별도 섬) 대략 중심 */
export const JEJU_CENTER: [number, number] = [126.55, 33.38];

// ── 도착 룰렛 (피벗: 예약 대신 현지 행동 게임) ──────────────
//
// 도시별 추천 장소. 초기엔 지역 특색을 담은 예시 문구로 제공하고,
// 이후 카카오/네이버 로컬 API 로 실제 근처 장소로 교체한다.
export interface CityPlace {
  name: string;
  kind: "맛집" | "카페";
  tag: string;
}

export const CITY_PLACES: Record<string, CityPlace[]> = {
  gangneung: [
    { name: "초당 순두부 골목", kind: "맛집", tag: "고소한 아침" },
    { name: "안목 커피거리 카페", kind: "카페", tag: "바다뷰" },
  ],
  sokcho: [
    { name: "속초 중앙시장 닭강정", kind: "맛집", tag: "겉바속촉" },
    { name: "영금정 앞 카페", kind: "카페", tag: "파도 소리" },
  ],
  chuncheon: [
    { name: "명동 닭갈비 골목", kind: "맛집", tag: "불맛" },
    { name: "호반 감성 카페", kind: "카페", tag: "물멍" },
  ],
  jeonju: [
    { name: "한옥마을 비빔밥집", kind: "맛집", tag: "전주 정식" },
    { name: "객리단길 로스터리", kind: "카페", tag: "골목 감성" },
  ],
  yeosu: [
    { name: "교동시장 게장백반", kind: "맛집", tag: "밥도둑" },
    { name: "돌산 오션뷰 카페", kind: "카페", tag: "밤바다" },
  ],
  gyeongju: [
    { name: "황리단길 쌈밥집", kind: "맛집", tag: "한상 가득" },
    { name: "첨성대 앞 황남빵 카페", kind: "카페", tag: "천년 간식" },
  ],
  tongyeong: [
    { name: "중앙시장 충무김밥", kind: "맛집", tag: "새콤달콤" },
    { name: "동피랑 언덕 카페", kind: "카페", tag: "항구뷰" },
  ],
  damyang: [
    { name: "떡갈비 한정식집", kind: "맛집", tag: "대통밥" },
    { name: "메타세쿼이아길 카페", kind: "카페", tag: "숲멍" },
  ],
  taean: [
    { name: "안면도 바지락칼국수", kind: "맛집", tag: "시원한 국물" },
    { name: "꽃지 노을 카페", kind: "카페", tag: "선셋" },
  ],
  jecheon: [
    { name: "청풍호 붕어찜", kind: "맛집", tag: "얼큰" },
    { name: "의림지 산책로 카페", kind: "카페", tag: "저수지뷰" },
  ],
};

export function getCityPlaces(cityId: string): CityPlace[] {
  return CITY_PLACES[cityId] ?? [];
}

// 병맛 행동 챌린지 덱 (도시 무관). {place} 는 룰렛에서 도시 장소로 치환.
const DARE_CHALLENGES: Omit<Mission, "id">[] = [
  { title: "어르신께 맛집 추천받기", description: "지나가는 동네 어르신께 진짜 맛집을 여쭤보고 그 집에 가보세요.", category: "DARE", emoji: "🧓", points: 30 },
  { title: "제일 이상한 메뉴 시키기", description: "메뉴판에서 가장 낯선 메뉴를 골라 도전해보세요.", category: "DARE", emoji: "🍽️", points: 30 },
  { title: "무작정 골목 탐험", description: "처음 보는 골목으로 아무 생각 없이 들어가 끝까지 걸어보세요.", category: "DARE", emoji: "🌀", points: 20 },
  { title: "가위바위보 여행", description: "동행자와 가위바위보로 다음 목적지를 정하세요. (혼자면 동전 던지기)", category: "DARE", emoji: "✌️", points: 20 },
  { title: "간판 부자 가게 입성", description: "글자가 가장 많은 간판의 가게에 들어가 보세요.", category: "DARE", emoji: "🔠", points: 25 },
  { title: "사투리로 주문하기", description: "현지인처럼 사투리로 주문에 도전해보세요.", category: "DARE", emoji: "🗣️", points: 30 },
  { title: "눈 감고 지도 찍기", description: "눈 감고 지도를 찍어 나온 곳으로 가보세요.", category: "DARE", emoji: "🙈", points: 25 },
  { title: "제일 촌스러운 기념품", description: "가장 촌스러운 기념품을 하나 사서 인증하세요.", category: "DARE", emoji: "🎁", points: 25 },
  { title: "컨셉 셀카 10장", description: "컨셉을 매번 다르게 셀카 10장을 찍어보세요.", category: "DARE", emoji: "🤳", points: 20 },
  { title: "처음 만난 사람에게 사진 부탁", description: "지나가는 사람에게 인생샷을 부탁해보세요.", category: "DARE", emoji: "📸", points: 25 },
  { title: "지역 특산물 사 먹기", description: "이 동네 특산물이나 길거리 간식 하나를 사 먹어보세요.", category: "DARE", emoji: "🍢", points: 25 },
  { title: "벤치에서 10분 멍때리기", description: "아무 벤치에 앉아 딱 10분만 아무것도 안 하고 쉬어보세요.", category: "DARE", emoji: "🪑", points: 15 },
  { title: "제일 오래돼 보이는 가게", description: "가장 오래된 느낌의 가게를 찾아 들어가 보세요.", category: "DARE", emoji: "🏚️", points: 30 },
  { title: "제일 신나 보이는 표정", description: "지금 이 순간 제일 신난 표정을 사진으로 남겨보세요.", category: "DARE", emoji: "🎶", points: 15 },
  { title: "처음 보는 음료 사기", description: "편의점에서 한 번도 안 마셔본 음료를 사 마셔보세요.", category: "DARE", emoji: "🥤", points: 20 },
  { title: "동네 강아지·고양이 찍기", description: "지나가는 강아지나 고양이 사진을 찍어보세요.", category: "DARE", emoji: "🐕", points: 20 },
  { title: "벽화·낙서 찾기", description: "골목의 벽화나 재밌는 낙서를 찾아 찍어보세요.", category: "DARE", emoji: "🎨", points: 20 },
  { title: "계단 제일 많은 곳 오르기", description: "근처에서 계단이 가장 많은 곳을 찾아 끝까지 올라가 보세요.", category: "DARE", emoji: "🪜", points: 25 },
  { title: "지도 없이 5분 걷기", description: "지도를 끄고 5분 걸은 뒤, 지금 어디인지 맞혀보세요.", category: "DARE", emoji: "🗺️", points: 25 },
  { title: "시장에서 흥정하기", description: "전통시장에서 살짝 흥정을 시도해보세요.", category: "DARE", emoji: "💬", points: 30 },
  { title: "하늘 사진 3장", description: "각도를 바꿔가며 하늘 사진 3장을 찍어보세요.", category: "DARE", emoji: "🌤️", points: 15 },
  { title: "이름이 웃긴 가게 찾기", description: "간판 이름이 제일 웃긴 가게를 찾아 인증하세요.", category: "DARE", emoji: "😂", points: 20 },
  { title: "지역명 들어간 메뉴 먹기", description: "이 지역 이름이 들어간 메뉴를 찾아 먹어보세요.", category: "DARE", emoji: "🍜", points: 25 },
  { title: "한 정거장 대중교통", description: "버스나 기차로 딱 한 정거장만 타보세요.", category: "DARE", emoji: "🚌", points: 25 },
  { title: "제일 높은 곳에서 내려다보기", description: "근처에서 가장 높은 곳에 올라 도시를 내려다보세요.", category: "DARE", emoji: "🏔️", points: 30 },
  { title: "3초 막춤 챌린지", description: "그 자리에서 아무 막춤이나 추다가, 제일 웃긴 동작에서 사진 한 장을 남기세요.", category: "DARE", emoji: "💃", points: 30 },
  { title: "사장님 추천 메뉴", description: "가게 사장님께 추천 메뉴를 여쭤보고 그대로 시켜보세요.", category: "DARE", emoji: "👨‍🍳", points: 25 },
  { title: "분홍색 물건 3개 찾기", description: "주변에서 분홍색 물건 3개를 찾아 찍어보세요.", category: "DARE", emoji: "🩷", points: 20 },
  { title: "오늘의 행운 색 쇼핑", description: "행운의 색을 하나 정하고, 그 색 물건을 사보세요.", category: "DARE", emoji: "🍀", points: 20 },
];

const PLACE_CHALLENGES: Omit<Mission, "id" | "cityId">[] = [
  { title: "{place} 인증샷", description: "룰렛이 정한 {place}에 가서 인증샷을 남기세요.", category: "PLACE", emoji: "📍", points: 30 },
  { title: "{place} 최고가 메뉴", description: "{place}에서 제일 비싼 메뉴에 도전해보세요!", category: "PLACE", emoji: "💸", points: 35 },
];

// 괴담/공포 컨셉 챌린지 — 실제 폐가·흉가 진입 없이, 혼자서 안전하게, "분위기와 텐션"으로만 쫄깃하게
const HORROR_CHALLENGES: Omit<Mission, "id">[] = [
  { title: "정각 4시 44분", description: "정확히 4시 44분(밤이면 새벽 4:44)에 시계나 폰 시간을 화면에 띄워 인증하세요. 44는 죽을 사(死)… 1분만 늦어도 실패.", category: "HORROR", emoji: "🕓", points: 35 },
  { title: "뒤돌아보지 마", description: "제자리에서 뒤로 33걸음 걷는 동안 절대 뒤돌아보지 마세요. 다 걸은 뒤 정면을 찍어 인증. 등 뒤에 뭐가 있었을지는… 몰라도 됩니다.", category: "HORROR", emoji: "👣", points: 30 },
  { title: "유리에 비친 나", description: "밤에 어두운 유리창·거울에 비친 내 모습을 찍으세요. 반사 속에 나 말고 다른 게 없는지 확인은… 하지 마세요.", category: "HORROR", emoji: "🪞", points: 30 },
  { title: "불 꺼진 창문 세기", description: "한 건물에서 불이 전부 꺼진 캄캄한 창문을 찾아, 그 창을 향해 한 장 찍으세요. 저 안엔 정말 아무도 없을까요.", category: "HORROR", emoji: "🪟", points: 25 },
  { title: "13 또는 4를 찾아라", description: "주변에서 숫자 '4'나 '13'을 찾아 사진에 담으세요. 층수, 방 번호, 버스… 눈에 띄기 시작하면 계속 보입니다.", category: "HORROR", emoji: "🔢", points: 25 },
  { title: "10초 정적 녹음", description: "가장 조용하고 어둑한 곳에서 눈을 감고 10초간 소리를 녹음하세요. 재생했을 때… 내 숨소리만 들리길.", category: "HORROR", emoji: "🎙️", points: 30 },
  { title: "가로등 사이 어둠", description: "가로등 불빛이 닿지 않는 딱 그 틈, 가장 짙은 어둠을 향해 한 장 찍으세요. (안전한 밝은 자리에 서서!)", category: "HORROR", emoji: "🌑", points: 25 },
  { title: "괴담 한 편 정주행", description: "이 지역 괴담을 하나 찾아 끝까지 읽고, 가장 소름 돋은 문장을 스크린샷하세요.", category: "HORROR", emoji: "📖", points: 25 },
  { title: "이 동네 공포 명소", description: "이 지역에서 소문난 으스스한 장소 근처까지만 가보세요. 폐가·흉가·사유지 안엔 절대 들어가지 말고, 밝은 도로변 바깥에서만 인증!", category: "HORROR", emoji: "🪦", points: 35 },
  { title: "길어진 그림자", description: "내 그림자가 유난히 길고 기괴하게 늘어진 순간을 포착하세요. 그림자가 나보다 먼저 움직인 건 기분 탓입니다.", category: "HORROR", emoji: "🕯️", points: 20 },
];

// 부모님과 여행 덱 — 효도·추억·실용 위주의 어른스러운 미션 (유치하지 않게)
const PARENTS_CHALLENGES: Omit<Mission, "id">[] = [
  { title: "부모님과 같은 프레임", description: "지나가는 분께 부탁드려 부모님과 나란히 한 장. 셀카 말고 제대로 된 사진으로 남겨보세요.", category: "DARE", emoji: "👨‍👩‍👧", points: 30 },
  { title: "부모님 최애 메뉴 대접", description: "부모님이 드시고 싶은 메뉴를 여쭤보고, 오늘 한 끼는 그걸로 대접해드리세요.", category: "DARE", emoji: "🍚", points: 30 },
  { title: "옛날 이야기 하나", description: "부모님 젊었을 적 이야기 하나를 여쭤 듣고, 가장 인상 깊은 한 문장을 메모해두세요.", category: "DARE", emoji: "📖", points: 30 },
  { title: "부모님 인생샷 찍어드리기", description: "이 지역 명소를 배경으로 부모님 독사진을 제일 잘 나오게 찍어드리세요.", category: "DARE", emoji: "📸", points: 25 },
  { title: "지역 특산 간식 사드리기", description: "이 동네 특산물이나 주전부리를 하나 사서 부모님과 나눠 드세요.", category: "DARE", emoji: "🍡", points: 25 },
  { title: "천천히 함께 걷기", description: "부모님 걸음에 맞춰 10분간 천천히 산책하며 이야기를 나눠보세요.", category: "DARE", emoji: "🚶", points: 20 },
  { title: "찻집에서 차 한잔", description: "전통찻집이나 조용한 카페에서 부모님과 마주 앉아 차 한잔의 여유를 가지세요.", category: "DARE", emoji: "🍵", points: 20 },
  { title: "부모님 기념품 골라드리기", description: "부모님께 어울릴 기념품을 직접 골라 선물해드리세요.", category: "DARE", emoji: "🎁", points: 25 },
  { title: "편의 지점 미리 파악", description: "화장실·벤치·약국 위치를 미리 확인해, 부모님이 편하게 다니실 동선을 챙기세요.", category: "DARE", emoji: "🧭", points: 20 },
  { title: "부모님 추천곡 듣기", description: "부모님이 좋아하시는 옛 노래를 하나 여쭤 함께 들어보세요.", category: "DARE", emoji: "🎵", points: 15 },
];

// 아기와 여행 덱 — 안전·편의 시설 위주의 실용 미션
const BABY_CHALLENGES: Omit<Mission, "id">[] = [
  { title: "수유실·기저귀대 찾기", description: "근처 수유실이나 기저귀 교환대가 있는 곳을 찾아 위치를 확인·인증하세요.", category: "DARE", emoji: "🍼", points: 30 },
  { title: "아기 의자 있는 식당", description: "유아용 의자가 있는 식당을 골라 편하게 식사하세요.", category: "DARE", emoji: "🪑", points: 25 },
  { title: "그늘진 산책로 찾기", description: "유모차가 다니기 좋고 그늘진 산책로를 찾아 아기와 걸어보세요.", category: "DARE", emoji: "🌳", points: 25 },
  { title: "아기 눈높이 한 컷", description: "아기 눈높이로 내려가 아기의 시선이 담긴 사진 한 장을 남겨보세요.", category: "DARE", emoji: "📷", points: 20 },
  { title: "안전 지점 미리 확인", description: "근처 약국이나 응급실 위치를 미리 확인해두세요. 만일을 대비한 안심 미션.", category: "DARE", emoji: "🏥", points: 25 },
  { title: "낮잠 명당 확보", description: "아기가 편히 낮잠 잘 수 있는 조용하고 그늘진 자리를 찾아보세요.", category: "DARE", emoji: "😴", points: 20 },
  { title: "유모차 접근 명소", description: "유모차로 편히 들어갈 수 있는 명소를 골라 아기와 함께 인증하세요.", category: "DARE", emoji: "🚼", points: 25 },
  { title: "아기 짐 점검", description: "기저귀·물티슈·여벌 옷이 충분한지 한 번 점검하고 사진으로 남겨두세요.", category: "DARE", emoji: "🎒", points: 15 },
  { title: "아기 간식 타임", description: "아기 이유식이나 간식을 챙겨 정해진 시간에 맞춰 먹여보세요.", category: "DARE", emoji: "🥣", points: 15 },
  { title: "좋아하는 색 찾기", description: "아기가 좋아하는 색이나 사물을 주변에서 찾아 보여주고 반응을 담아보세요.", category: "DARE", emoji: "🎈", points: 20 },
];

/** 테마별 기본 덱 (공포는 별도 경로) */
function themeDeck(theme: TripTheme): Omit<Mission, "id">[] {
  if (theme === "parents") return PARENTS_CHALLENGES;
  if (theme === "baby") return BABY_CHALLENGES;
  return DARE_CHALLENGES;
}

/**
 * 도착 룰렛 스핀(로컬 폴백 — AI 미사용 시). 일반/부모님/아기 모드는 테마 덱 75% · 도시 장소 25%.
 * theme="horror"(공포 트립)일 때만 괴담 덱에서 뽑는다 → 일반 트립엔 절대 공포 미션이 안 뜬다.
 * exclude 에 담긴 제목은 가급적 피해 뽑아 중복을 줄인다.
 */
export function spinRoulette(
  cityId: string,
  exclude: string[] = [],
  theme: TripTheme = "normal",
): Mission {
  const skip = new Set(exclude);
  const nonce = Math.floor(Math.random() * 1e6).toString(36);
  const places = getCityPlaces(cityId);

  if (theme === "horror") {
    const horrorCands = HORROR_CHALLENGES.map((c) => ({ ...c }));
    const fresh = horrorCands.filter((c) => !skip.has(c.title));
    const pool = fresh.length > 0 ? fresh : horrorCands;
    const base = pool[Math.floor(Math.random() * pool.length)];
    return { ...base, id: `spin-${nonce}` } as Mission;
  }

  // 가능한 모든 후보(제목 기준)를 만들어 exclude 되지 않은 것에서 뽑는다
  const placeCands = places.flatMap((place) =>
    PLACE_CHALLENGES.map((base) => ({
      ...base,
      cityId,
      title: base.title.replace("{place}", place.name),
      description: `${base.description.replace("{place}", place.name)} (${place.tag})`,
    })),
  );
  const dareCands = themeDeck(theme).map((c) => ({ ...c }));

  // 일반 모드는 괴담을 섞지 않는다: 도시 장소 25% · 병맛 행동 75%
  // (장소 후보가 없으면 그 몫도 병맛 행동으로)
  const roll = Math.random();
  const deck = placeCands.length > 0 && roll < 0.25 ? placeCands : dareCands;

  const all = [...dareCands, ...placeCands];
  const fresh = deck.filter((c) => !skip.has(c.title));
  const pool = fresh.length > 0 ? fresh : all.filter((c) => !skip.has(c.title));
  const finalPool = pool.length > 0 ? pool : all;
  const base = finalPool[Math.floor(Math.random() * finalPool.length)];
  return { ...base, id: `spin-${nonce}` } as Mission;
}

/** 룰렛 화면 슬롯 애니메이션용 이모지 (스핀 중 스쳐가는 얼굴들) */
export const ROULETTE_FACES = [
  "🧓", "🟥", "🍽️", "🌀", "✌️", "🔠", "🗣️", "🙈", "🎁", "🤳", "📍", "💸",
];
