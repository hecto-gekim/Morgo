// 뽑힌 목적지 "주변"의 갈 만한 장소 추천 — Perplexity로 해당 지역/인근의 실제 장소를 검색한다.
// baby: 아이와 체험·관람할 곳(어린이박물관·과학관·아쿠아리움·동물원·테마파크 등)
// parents: 부모님과 다니기 좋은 관광지(절·수목원·정원·전통마을·미술관 등)

import { callPerplexity } from "@/lib/perplexity";
import type { TripTheme } from "@/lib/types";

interface NearbyRaw {
  name?: string;
  why?: string;
  status?: string;
}

function promptFor(
  theme: TripTheme,
  province: string,
  city: string,
  exclude: string,
): string {
  const where = `${province} ${city}`.trim();
  const target =
    theme === "baby"
      ? `어린 아이와 함께 체험·관람할 수 있는 곳(어린이박물관, 과학관, 아쿠아리움, 동물원·목장, 테마파크, 실내 체험관 등)`
      : `부모님과 함께 다니기 좋은 관광지(사찰·절, 수목원·식물원, 정원, 전통 한옥마을, 미술관, 전망 좋은 공원 등)`;
  return (
    `지금은 2026년이다. 대한민국 "${where}" 및 그 인근(같은 도/광역권, 차로 1시간 내외)에서\n` +
    `${target}를 웹검색해 서로 다른 3~4곳을 추천하라.\n` +
    `- 2026년 현재 정상 운영/개방 중인 실제 장소만.\n` +
    (exclude ? `- "${exclude}"는 이미 가는 곳이니 제외하라.\n` : "") +
    `- 각 장소는 "${where}"에서 너무 멀지 않아야 한다.\n\n` +
    `[출력] JSON만:\n` +
    `{"spots":[{"name":"정확한 장소명","why":"왜 갈 만한지 한 줄","status":"운영중"}]}`
  );
}

const GONE = /폐관|폐업|휴관|철거|이전|없어|사라|공사/;

export async function POST(request: Request) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return Response.json({ configured: false, spots: [] });

  let body: {
    theme?: TripTheme;
    province?: string;
    city?: string;
    exclude?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const theme: TripTheme = body.theme === "parents" ? "parents" : "baby";
  const province = String(body.province ?? "").slice(0, 20);
  const city = String(body.city ?? "").slice(0, 20);
  const exclude = String(body.exclude ?? "").slice(0, 40);
  if (!city) return Response.json({ configured: true, spots: [] });

  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await callPerplexity(
      key,
      promptFor(theme, province, city, exclude),
      { maxTokens: 1000 },
    );
    if (!r.ok) continue;
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) continue;
    try {
      const raw = JSON.parse(m[0]) as { spots?: NearbyRaw[] };
      const spots = (raw.spots ?? [])
        .filter((s) => s?.name && !GONE.test(`${s.status ?? ""} ${s.why ?? ""}`))
        .slice(0, 4)
        .map((s) => ({
          name: String(s.name).slice(0, 40),
          description: String(s.why ?? "")
            .replace(/\[\d+\]/g, "") // Perplexity 인용표시 제거
            .trim()
            .slice(0, 120),
        }))
        // 뽑힌 목적지와 같은 이름은 제외
        .filter((s) => s.name && s.name !== exclude);
      if (spots.length) return Response.json({ configured: true, spots });
    } catch {
      // 파싱 실패 → 다음 시도
    }
  }
  return Response.json({ configured: true, spots: [] });
}
