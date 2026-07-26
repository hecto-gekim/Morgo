"use client";

// 공유 카드를 인스타 스토리 비율(1080x1920) PNG로 렌더링. 외부 라이브러리 없이 Canvas 2D로 직접 그린다.

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = url;
  });
}

/** CSS object-fit: cover 처럼 캔버스 전체를 채우도록 잘라 그린다 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const srcRatio = img.width / img.height;
  const dstRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (srcRatio > dstRatio) {
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

export async function renderShareImage(opts: {
  cityName: string;
  rarityLabel?: string;
  points: number;
  missionTitles: string[];
  /** 대표 미션 인증샷(dataURL) — 있으면 배경으로 깔아 진짜 "하이라이트"처럼 만든다 */
  coverImageUrl?: string;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unsupported");

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#0a0a12");
  grad.addColorStop(1, "#e91e63");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (opts.coverImageUrl) {
    try {
      const img = await loadImage(opts.coverImageUrl);
      drawCover(ctx, img, canvas.width, canvas.height);
      const overlay = ctx.createLinearGradient(0, 0, 0, canvas.height);
      overlay.addColorStop(0, "rgba(10,10,18,0.6)");
      overlay.addColorStop(0.45, "rgba(10,10,18,0.35)");
      overlay.addColorStop(1, "rgba(233,30,99,0.8)");
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } catch {
      /* 이미지 로드 실패 시 그라디언트 배경만 유지 */
    }
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#eaff00";
  ctx.font = "bold 44px sans-serif";
  ctx.fillText("🎯 당첨", canvas.width / 2, 300);

  if (opts.rarityLabel) {
    ctx.font = "bold 40px sans-serif";
    const label = `${opts.rarityLabel} 당첨!`;
    const w = ctx.measureText(label).width + 80;
    const x = canvas.width / 2 - w / 2;
    ctx.fillStyle = "#eaff00";
    ctx.beginPath();
    ctx.roundRect(x, 350, w, 76, 38);
    ctx.fill();
    ctx.fillStyle = "#0a0a12";
    ctx.fillText(label, canvas.width / 2, 400);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 100px sans-serif";
  ctx.fillText(opts.cityName, canvas.width / 2, 560);

  ctx.font = "bold 58px sans-serif";
  ctx.fillStyle = "#eaff00";
  ctx.fillText(`${opts.points}P 획득 🔥`, canvas.width / 2, 660);

  let y = 800;
  ctx.font = "38px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  for (const title of opts.missionTitles.slice(0, 9)) {
    const text = `✔ ${title}`;
    ctx.fillText(text.length > 26 ? `${text.slice(0, 25)}…` : text, 110, y);
    y += 72;
  }
  if (opts.missionTitles.length === 0) {
    ctx.fillStyle = "#ffffffb0";
    ctx.fillText("아직 클리어한 미션이 없어요", 110, y);
  }

  ctx.textAlign = "center";
  ctx.font = "bold 42px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Morgo", canvas.width / 2, canvas.height - 140);
  ctx.font = "32px sans-serif";
  ctx.fillStyle = "#ffffffb0";
  ctx.fillText("핀 던지면 그냥 가는 거임", canvas.width / 2, canvas.height - 90);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob_failed"))),
      "image/png",
    );
  });
}
