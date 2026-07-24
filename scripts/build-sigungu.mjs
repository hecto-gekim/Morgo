// 전국 시·군·구 GeoJSON → Morgo 지도용 경량 폴리곤 JSON 빌드.
//
// 입력: southkorea-maps 시군구 GeoJSON (kostat 2018)
//   기본 경로는 스크래치패드에 받아둔 sigungu.json. 인자로 덮어쓸 수 있음.
// 출력: public/korea-sigungu.json  (앱에서 fetch 해서 렌더)
//
// 처리:
//  1) "○○시○○구" 는 상위 "○○시" 로 병합 (시/군 단위 지도)
//  2) 링별 Douglas-Peucker 단순화 + 좌표 4자리 반올림
//  3) 외곽 링만 사용(구멍 무시), 아주 작은 섬 링 제거
//
// 실행: node scripts/build-sigungu.mjs [입력경로]

import { readFileSync, writeFileSync } from "node:fs";

const INPUT =
  process.argv[2] ??
  "C:/Users/hecto/AppData/Local/Temp/claude/D--project-ALPHA-Morgo/f7200bf7-c89b-4506-88a1-7e4b98a480a8/scratchpad/sigungu.json";
const OUTPUT = "public/korea-sigungu.json";

const TOLERANCE = 0.006; // 약 0.6km — 모바일 지도 수준으로 충분
const MIN_RING_POINTS = 4;
const MIN_RING_AREA = 0.00008; // 아주 작은 섬 링 제거 (deg^2)

/** 수직 거리 기반 Douglas-Peucker */
function simplify(points, tol) {
  if (points.length <= 2) return points;
  let maxD = 0;
  let idx = 0;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    const t = ((px - ax) * dx + (py - ay) * dy) / len2;
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > tol) {
    const left = simplify(points.slice(0, idx + 1), tol);
    const right = simplify(points.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

const round = (n) => Math.round(n * 1e4) / 1e4;

/** Polygon/MultiPolygon → 외곽 링 좌표 배열들 */
function outerRings(geom) {
  const polys =
    geom.type === "Polygon"
      ? [geom.coordinates]
      : geom.type === "MultiPolygon"
        ? geom.coordinates
        : [];
  return polys.map((p) => p[0]); // 각 폴리곤의 외곽 링만
}

function processRings(rings) {
  const out = [];
  for (const ring of rings) {
    if (ringArea(ring) < MIN_RING_AREA) continue;
    let s = simplify(ring, TOLERANCE).map(([lng, lat]) => [round(lng), round(lat)]);
    if (s.length < MIN_RING_POINTS) continue;
    out.push(s);
  }
  return out;
}

// ── 실행 ────────────────────────────────────────────────────
const geo = JSON.parse(readFileSync(INPUT, "utf8"));

// 1) 시-구 병합
const groups = new Map(); // key -> {code, name, rings[]}
for (const f of geo.features) {
  const name = f.properties.name;
  const code = f.properties.code;
  const m = name.match(/^(.+?시)(.+구)$/); // "전주시완산구" → "전주시"
  const key = m ? m[1] : name;
  const mergedCode = m ? code.slice(0, 4) + "0" : code;
  if (!groups.has(key)) {
    groups.set(key, { code: mergedCode, name: key, rings: [] });
  }
  groups.get(key).rings.push(...outerRings(f.geometry));
}

// 2) 단순화
const regions = [];
let totalPts = 0;
for (const g of groups.values()) {
  const polys = processRings(g.rings);
  if (polys.length === 0) continue;
  totalPts += polys.reduce((n, r) => n + r.length, 0);
  regions.push({ code: g.code, name: g.name, polys });
}

regions.sort((a, b) => a.code.localeCompare(b.code));
writeFileSync(OUTPUT, JSON.stringify(regions));

const bytes = readFileSync(OUTPUT).length;
console.log(
  `regions=${regions.length} points=${totalPts} size=${(bytes / 1024).toFixed(0)}KB → ${OUTPUT}`,
);
// 시드 도시 매칭 확인
for (const n of ["강릉시", "전주시", "통영시", "담양군", "태안군"]) {
  const r = regions.find((x) => x.name === n);
  console.log(" ", n, r ? `code=${r.code} polys=${r.polys.length}` : "MISSING");
}
