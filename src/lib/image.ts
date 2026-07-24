"use client";

// 클라이언트 전용 이미지/위치 유틸.
// 사진은 localStorage(zustand persist)에 dataURL 로 저장되므로 반드시 축소한다.

/**
 * File → 축소된 JPEG dataURL.
 * 긴 변을 max(px) 이하로 리사이즈하고 품질을 낮춰 용량을 줄인다.
 */
export async function fileToThumbDataUrl(
  file: File,
  max = 1024,
  quality = 0.72,
): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // createImageBitmap 미지원 브라우저 폴백: 원본 dataURL
    return fileToDataUrl(file);
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fileToDataUrl(file);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface Coords {
  latitude: number;
  longitude: number;
}

/** navigator.geolocation Promise 래퍼 */
export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("이 브라우저에서는 위치를 사용할 수 없어요."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "위치 권한이 거부되었어요. 브라우저 설정에서 허용해 주세요."
            : "현재 위치를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
