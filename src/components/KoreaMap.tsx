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

const NAVY = "#1e2a4a";
const PINK = "#f49ba8";
const PINK_SOFT = "#fce3e6";
const YELLOW = "#f6d35c";

/** 방문/사진 상태에 따른 폴리곤 채움색 (사진 없을 때) */
function fillOf(
  record: CityRecord | undefined,
  isSeed: boolean,
  isActive: boolean,
): { fill: string; opacity: number } {
  if (isActive) return { fill: YELLOW, opacity: 1 };
  if (record) return { fill: PINK, opacity: 0.55 };
  if (isSeed) return { fill: PINK_SOFT, opacity: 1 };
  return { fill: NAVY, opacity: 0.06 };
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

/** 가장 큰 링의 대략 중심 (라벨 위치) */
function centroid(polys: [number, number][][]): { x: number; y: number } {
  let big = polys[0];
  for (const r of polys) if (r.length > big.length) big = r;
  let sx = 0;
  let sy = 0;
  for (const [lng, lat] of big) {
    const p = projectKorea(lat, lng);
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / big.length, y: sy / big.length };
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
}: {
  regions: Region[];
  records: Record<string, CityRecord>;
  activeCode?: string;
  selectedCode?: string;
  onSelect: (code: string, name: string) => void;
}) {
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
        const isActive = r.code === activeCode;
        const { fill, opacity } = fillOf(record, !!seed, isActive);
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
              stroke={isSelected ? NAVY : PINK}
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
            stroke={NAVY}
            strokeWidth={0.8}
            className="pointer-events-none"
          />
        );
      })}

      {/* 시드 도시 라벨 (사진 없는 곳만) */}
      {regions.map((r) => {
        const seed = getCityByCode(r.code);
        if (!seed) return null;
        const record = records[seed.id];
        if (record?.photos[0]) return null; // 사진이 있으면 라벨 생략
        const c = centroid(r.polys);
        return (
          <text
            key={`label-${r.code}`}
            x={c.x}
            y={c.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={2.6}
            fontWeight={700}
            fill={NAVY}
            fillOpacity={record ? 1 : 0.5}
            className="pointer-events-none select-none"
          >
            {seed.name.replace(/(시|군)$/, "")}
          </text>
        );
      })}
    </svg>
  );
}
