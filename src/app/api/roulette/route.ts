// 도착 룰렛 챌린지 AI 생성 (Gemini + Google 검색 그라운딩).
//
// GEMINI_API_KEY 가 있으면 Gemini 가 실시간 검색으로 도시에 맞는 병맛 여행
// 챌린지를 매번 새로 생성한다. 없으면 { configured: false } → 클라이언트 로컬 폴백.

import { callGemini } from "@/lib/gemini";

interface RouletteBody {
  city: string;
  province?: string;
  food?: string;
  landmark?: string;
  exclude?: string[]; // 이미 나온 제목들 (중복 방지)
  count?: number;
}

interface Challenge {
  title: string;
  description: string;
  emoji: string;
  points: number;
  category: "DARE" | "PLACE";
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ configured: false });

  let body: RouletteBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const count = Math.min(Math.max(body.count ?? 10, 1), 15);
  const exclude = (body.exclude ?? []).slice(0, 40);

  const prompt =
    `너는 여행 예능 작가야. 지금 여행자가 "${body.city}"(${body.province ?? ""})에 도착했어.\n` +
    `구글 검색으로 이 지역의 실제 명소·맛집·카페·특산물을 찾아본 뒤,\n` +
    `여기서 즉흥으로 할 수 있는 재밌고 병맛 넘치는 "도착 룰렛" 챌린지 ${count}개를 만들어줘.\n\n` +
    `규칙:\n` +
    `- 실제로 5~30분 안에 혼자서도 할 수 있는 행동일 것 (사진 인증 가능)\n` +
    `- 위험하거나 민폐거나 돈 많이 드는 건 금지\n` +
    `- 절반 정도는 이 도시의 실제 장소/특색을 살릴 것 (검색으로 찾은 진짜 가게·명소 이름 사용 OK)\n` +
    `- 참고: 대표 명소 ${body.landmark ?? "?"}, 지역 음식 ${body.food ?? "?"}\n` +
    `- 엉뚱하고 웃기게. 뻔한 것 금지\n` +
    (exclude.length ? `- 다음 제목들과 겹치지 않게: ${exclude.join(", ")}\n` : "") +
    `\n각 챌린지는 아래 JSON 배열로만 답해(다른 설명 문장 없이):\n` +
    `[{"title":"짧은 제목","description":"한 문장 설명","emoji":"이모지 1개","points":15~35 정수,"category":"DARE 또는 PLACE"}]`;

  const r = await callGemini(apiKey, [{ text: prompt }], {
    search: true,
    // thinking(~1.5k) + JSON 여유분. 부족하면 잘려서 parse 실패 → 폴백됨
    maxOutputTokens: 6000,
  });
  if (!r.ok) {
    return Response.json(
      { error: "upstream_error", status: r.status, detail: r.detail },
      { status: 502 },
    );
  }

  const arrMatch = r.text.match(/\[[\s\S]*\]/);
  if (!arrMatch) {
    return Response.json({ error: "unparseable", raw: r.text.slice(0, 300) }, { status: 502 });
  }

  try {
    const raw = JSON.parse(arrMatch[0]) as Challenge[];
    const challenges = raw
      .filter((c) => c?.title && c?.description)
      .map((c) => ({
        title: String(c.title).slice(0, 40),
        description: String(c.description).slice(0, 120),
        emoji: (c.emoji || "🎲").slice(0, 4),
        points: Math.min(Math.max(Math.round(Number(c.points) || 20), 15), 35),
        category: c.category === "PLACE" ? "PLACE" : "DARE",
      }));
    return Response.json({ configured: true, challenges });
  } catch {
    return Response.json({ error: "parse_failed", raw: r.text.slice(0, 300) }, { status: 502 });
  }
}
