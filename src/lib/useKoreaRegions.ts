import { useEffect, useState } from "react";
import type { Region } from "@/components/KoreaMap";
import { registerRegionsAsCities } from "./seed";

let cache: Region[] | null = null;
let inflight: Promise<Region[]> | null = null;

function loadRegions(): Promise<Region[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/korea-sigungu.json")
      .then((r) => r.json())
      .then((data: Region[]) => {
        cache = data;
        registerRegionsAsCities(data); // 전국 시군구를 도시 레지스트리에 등록 (핀 던지기 등에서 사용)
        return data;
      })
      .catch(() => {
        cache = [];
        return [];
      });
  }
  return inflight;
}

/** 대한민국 시·군·구 폴리곤. 번들 크기 절감을 위해 런타임에 fetch, 앱 전체에서 1회만 요청되도록 캐시 공유 */
export function useKoreaRegions(): Region[] | null {
  // 이미 캐시돼 있으면(다른 컴포넌트가 먼저 불러온 경우) 첫 렌더부터 바로 값을 사용
  const [regions, setRegions] = useState<Region[] | null>(() => cache);

  useEffect(() => {
    if (cache) return; // 이미 값 있음 — fetch 불필요
    let alive = true;
    loadRegions().then((data) => {
      if (alive) setRegions(data);
    });
    return () => {
      alive = false;
    };
  }, []);

  return regions;
}
