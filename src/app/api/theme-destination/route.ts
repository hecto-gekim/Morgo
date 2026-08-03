// 부모/아이 테마 목적지 뽑기 — Perplexity로 "지금도 실존하는" 국내 명소를 웹검색해 후보를 돌려준다.
// 부모: 절·수목원·정원·전통마을 같은 차분한 관광지. 아이: 어린이박물관·과학관(우주)·테디베어뮤지엄
// ·아쿠아리움 같은 놀거리. 지역(도/시·군·구)만 반환하고, 실제 도시 매칭은 클라이언트에서 한다.

import { callPerplexity } from "@/lib/perplexity";
import type { TripTheme } from "@/lib/types";

interface SpotCandRaw {
  name?: string;
  province?: string;
  city?: string;
  category?: string;
  why?: string;
  status?: string;
}

function promptFor(theme: TripTheme): string {
  const base =
    `지금은 2026년이다. 대한민국(서울 제외)의 실제 명소를 웹검색해 선정하라.\n\n` +
    `[공통 조건]\n` +
    `1. 2026년 현재 정상 운영/개방 중이어야 한다(폐관·이전·철거된 곳 제외).\n` +
    `2. 일반인이 정식으로 방문·입장할 수 있는 곳.\n` +
    `3. 시·도별 최대 1곳, 서로 다른 지역으로 6곳.\n\n`;
  const themed =
    theme === "parents"
      ? `[대상] 부모님(중장년·노년)과 함께 차분히 다니기 좋은 관광지 위주.\n` +
        `- 예: 유명 사찰/절, 수목원·식물원, 정원, 전통 한옥마을, 고택, 미술관, 전망 좋은 공원.\n` +
        `- 걷기 편하고 경관·정취가 좋은 곳을 우선. 시끄럽거나 과격한 놀이시설은 제외.\n`
      : `[대상] 어린 아이와 함께 즐기기 좋은, 아이가 놀거나 체험할 수 있는 곳 위주.\n` +
        `- 예: 어린이박물관, 과학관·천문대(우주 테마), 테디베어뮤지엄, 아쿠아리움, 동물원·목장, 실내 체험관.\n` +
        `- 유아·아동 동반이 환영되고 안전·편의(유모차 등)가 갖춰진 곳을 우선.\n`;
  const out =
    `\n[출력] JSON만:\n` +
    `{\n` +
    `  "spots": [{\n` +
    `    "name": "정확한 장소명", "province": "도/광역시", "city": "시/군/구",\n` +
    `    "category": "장소 유형", "why": "왜 좋은지 한 문장",\n` +
    `    "status": "운영중"\n` +
    `  }]\n` +
    `}`;
  return base + themed + out;
}

const GONE = /폐관|폐업|휴관|철거|이전|없어|사라|공사/;

export async function POST(request: Request) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return Response.json({ configured: false });

  let body: { theme?: TripTheme };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const theme: TripTheme = body.theme === "baby" ? "baby" : "parents";

  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await callPerplexity(key, promptFor(theme), { maxTokens: 1400 });
    if (!r.ok) continue;
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) continue;
    try {
      const raw = JSON.parse(m[0]) as { spots?: SpotCandRaw[] };
      const spots = (raw.spots ?? [])
        .filter(
          (s) =>
            s?.name &&
            s?.province &&
            s?.city &&
            !GONE.test(`${s.status ?? ""} ${s.why ?? ""}`),
        )
        .slice(0, 6)
        .map((s) => ({
          name: String(s.name).slice(0, 40),
          province: String(s.province).slice(0, 20),
          city: String(s.city).slice(0, 20),
          description: [s.category ? `[${s.category}] ` : "", s.why ?? ""]
            .join("")
            // Perplexity 인용표시([11], [10][17] 등) 제거
            .replace(/\[\d+\]/g, "")
            .trim()
            .slice(0, 160),
        }));
      if (spots.length) return Response.json({ configured: true, spots });
    } catch {
      // JSON 파싱 실패 → 다음 시도
    }
  }
  return Response.json({ configured: true, spots: [] });
}
