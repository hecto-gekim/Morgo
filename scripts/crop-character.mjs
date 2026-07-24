// 캐릭터 시트에서 개별 캐릭터 이미지를 잘라 public/character/ 에 저장
// 사용: node scripts/crop-character.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SHEET = "public/ChatGPT Image 2026년 7월 18일 오후 02_47_37.png";
const OUT = "public/character";
mkdirSync(OUT, { recursive: true });

// left, top, width, height (1254×1254 기준)
const CROPS = {
  hero: [370, 25, 460, 515],
  excited: [40, 590, 150, 150],
  wondering: [215, 590, 150, 150],
  thrilled: [395, 590, 150, 150],
  happy: [590, 590, 150, 150],
  wave: [820, 595, 150, 190],
  camera: [1025, 595, 175, 190],
  map: [810, 835, 175, 180],
  luggage: [1025, 835, 175, 180],
};

for (const [name, [left, top, width, height]] of Object.entries(CROPS)) {
  await sharp(SHEET)
    .extract({ left, top, width, height })
    .png()
    .toFile(`${OUT}/${name}.png`);
  console.log(`${name}.png <- ${left},${top} ${width}x${height}`);
}
