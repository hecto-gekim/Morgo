// 공포 모드용 랜덤 유령 이미지 (public/ghost/*)
export const GHOST_IMAGES = [
  "/ghost/ghost1.jpg",
  "/ghost/ghost2.jpg",
  "/ghost/ghost3.jpg",
  "/ghost/ghost4.jpg",
];

/** seed(예: trip.id) 기반 결정적 선택 — SSR/CSR 하이드레이션 불일치를 피한다 */
export function ghostImageFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GHOST_IMAGES[h % GHOST_IMAGES.length];
}

/** 매번 무작위 (클라이언트 상호작용으로만 마운트되는 곳에서 사용) */
export function randomGhostImage(): string {
  return GHOST_IMAGES[Math.floor(Math.random() * GHOST_IMAGES.length)];
}
