"use client";

import { MAP_VIEW, projectKorea } from "@/lib/logic";
import { getCityByCode } from "@/lib/seed";
import type { CityRecord } from "@/lib/types";

export interface Region {
  code: string;
  name: string;
  /** 외곽 링 목록. 각 링은 [lng, lat] 배열 */
  polys: [number, number][][];
}

const PALETTE = {
  normal: { navy: "#0a0a12", pink: "#e91e63", pinkSoft: "#ffd6e4", yellow: "#eaff00" },
  // globals.css의 [data-theme="horror"] 값과 맞춤
  horror: { navy: "#0d0205", pink: "#b3122e", pinkSoft: "#ffd6dc", yellow: "#7cff3d" },
};

/** activeCode가 2자리(광역시 전체 뭉침 코드)면 같은 접두사 전체를, 5자리면 정확히 그 시군구만 매칭 */
function matchesActive(code: string, activeCode?: string): boolean {
  if (!activeCode) return false;
  return activeCode.length <= 2 ? code.startsWith(activeCode) : code === activeCode;
}

/** 방문/사진 상태에 따른 폴리곤 채움색 (사진 없을 때) */
function fillOf(
  record: CityRecord | undefined,
  isSeed: boolean,
  isActive: boolean,
  colors: typeof PALETTE.normal,
): { fill: string; opacity: number } {
  if (isActive) return { fill: colors.yellow, opacity: 1 };
  if (record) return { fill: colors.pink, opacity: 0.55 };
  if (isSeed) return { fill: colors.pinkSoft, opacity: 1 };
  return { fill: colors.navy, opacity: 0.06 };
}

/** 링 → SVG path 조각 */
function ringPath(ring: [number, number][]): string {
  return (
    ring
      .map(([lng, lat], i) => {
        const { x, y } = projectKorea(lat, lng);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ") + "Z"
  );
}

/** 폴리곤 전체의 투영 bounding box (사진 이미지 배치용) */
function bbox(polys: [number, number][][]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of polys) {
    for (const [lng, lat] of ring) {
      const { x, y } = projectKorea(lat, lng);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * 대한민국 시·군·구 폴리곤 지도(명세서 16장).
 * 사진을 등록한 도시는 그 사진이 시·군 경계 모양으로 클립되어 지도에 표시된다.
 */
export default function KoreaMap({
  regions,
  records,
  activeCode,
  selectedCode,
  onSelect,
  horror = false,
}: {
  regions: Region[];
  records: Record<string, CityRecord>;
  activeCode?: string;
  selectedCode?: string;
  onSelect: (code: string, name: string) => void;
  /** 공포 모드 팔레트로 그릴지 (색상은 하드코딩 hex라 CSS 변수를 못 타서 prop으로 받음) */
  horror?: boolean;
}) {
  const colors = horror ? PALETTE.horror : PALETTE.normal;
  return (
    <svg
      viewBox={`0 0 ${MAP_VIEW.w} ${MAP_VIEW.h}`}
      className="h-auto w-full"
      role="img"
      aria-label="대한민국 여행 지도"
    >
      {/* 사진 클립 정의 */}
      <defs>
        {regions.map((r) => {
          const key = getCityByCode(r.code)?.id ?? r.code;
          const photo = records[key]?.photos[0];
          if (!photo) return null;
          return (
            <clipPath key={`clip-${r.code}`} id={`clip-${r.code}`}>
              <path d={r.polys.map(ringPath).join(" ")} />
            </clipPath>
          );
        })}
      </defs>

      {/* 채움 (색) */}
      {regions.map((r) => {
        const seed = getCityByCode(r.code);
        const key = seed?.id ?? r.code;
        const record = records[key];
        const isActive = matchesActive(r.code, activeCode);
        const { fill, opacity } = fillOf(record, !!seed, isActive, colors);
        return (
          <path
            key={`fill-${r.code}`}
            d={r.polys.map(ringPath).join(" ")}
            fill={fill}
            fillOpacity={opacity}
            stroke="#ffffff"
            strokeWidth={0.25}
            className="cursor-pointer"
            onClick={() => onSelect(r.code, r.name)}
          >
            <title>{r.name}</title>
          </path>
        );
      })}

      {/* 등록 사진 (시·군 모양으로 클립) + 테두리 */}
      {regions.map((r) => {
        const seed = getCityByCode(r.code);
        const key = seed?.id ?? r.code;
        const photo = records[key]?.photos[0];
        if (!photo) return null;
        const b = bbox(r.polys);
        const isSelected = r.code === selectedCode;
        return (
          <g key={`photo-${r.code}`} onClick={() => onSelect(r.code, r.name)}>
            <image
              href={photo.url}
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#clip-${r.code})`}
              className="cursor-pointer"
            />
            <path
              d={r.polys.map(ringPath).join(" ")}
              fill="none"
              stroke={isSelected ? colors.navy : colors.pink}
              strokeWidth={isSelected ? 0.9 : 0.5}
              className="cursor-pointer"
            />
          </g>
        );
      })}

      {/* 선택 강조 테두리 (사진 없는 선택 도시) */}
      {regions.map((r) => {
        if (r.code !== selectedCode) return null;
        const key = getCityByCode(r.code)?.id ?? r.code;
        if (records[key]?.photos[0]) return null; // 사진 있으면 위에서 처리
        return (
          <path
            key={`sel-${r.code}`}
            d={r.polys.map(ringPath).join(" ")}
            fill="none"
            stroke={colors.navy}
            strokeWidth={0.8}
            className="pointer-events-none"
          />
        );
      })}
    </svg>
  );
}
