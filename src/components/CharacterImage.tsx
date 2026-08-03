"use client";

import Image, { type ImageProps } from "next/image";
import { useMorgo } from "@/lib/store";

/**
 * 공포 모드(전역 토글)일 때 `/character/x.png` → `/character/scary/x.png`(공포 스티커)로 바꿔준다.
 * scary 폴더에 없는 경로면 원본을 그대로 쓴다.
 */
export function scaryCharacterSrc(src: string, horror: boolean): string {
  if (!horror) return src;
  const m = src.match(/^\/character\/([\w-]+\.png)$/);
  return m ? `/character/scary/${m[1]}` : src;
}

/** next/image 래퍼 — 공포 모드면 캐릭터 이미지를 공포 스티커로 자동 교체 */
export default function CharacterImage({
  src,
  ...rest
}: Omit<ImageProps, "src"> & { src: string }) {
  const horror = useMorgo((s) => s.theme === "horror");
  return <Image src={scaryCharacterSrc(src, horror)} {...rest} />;
}
