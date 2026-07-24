// 미션 사진 AI 판정 (Gemini 비전, 명세서 18장 MissionValidator).
//
// GEMINI_API_KEY 가 있으면 Gemini 가 사진이 미션 조건을 만족하는지 판정한다.
// 없으면 { configured: false } → 클라이언트가 시뮬레이션 판정으로 폴백.

import { callGemini } from "@/lib/gemini";

interface ValidateBody {
  image: string; // dataURL (data:image/...;base64,....)
  title: string;
  description: string;
  category: string;
}

/** dataURL → { mimeType, data } */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ configured: false });

  let body: ValidateBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = parseDataUrl(body.image ?? "");
  if (!parsed) {
    return Response.json({ error: "invalid_image" }, { status: 400 });
  }

  const prompt =
    `너는 여행 사진 미션 심판이야. 첨부한 사진이 이 미션을 충족하는지 판정해줘.\n` +
    `미션: "${body.title}" (${body.category})\n` +
    `설명: ${body.description}\n\n` +
    `사진에 미션 대상이 실제로 보이는지 관대하지만 합리적으로 판단해.\n` +
    `반드시 아래 JSON 형식으로만 답해(다른 문장 없이):\n` +
    `{"match": true 또는 false, "confidence": 0.0~1.0, "reason": "한국어 한 문장"}`;

  const r = await callGemini(
    apiKey,
    [
      { inline_data: { mime_type: parsed.mimeType, data: parsed.data } },
      { text: prompt },
    ],
    // thinking 여유분 포함 (부족하면 판정 JSON 잘림 → 시뮬레이션 폴백)
    { maxOutputTokens: 1500 },
  );
  if (!r.ok) {
    return Response.json(
      { error: "upstream_error", status: r.status, detail: r.detail },
      { status: 502 },
    );
  }

  const jsonMatch = r.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return Response.json({ error: "unparseable", raw: r.text.slice(0, 300) }, { status: 502 });
  }

  try {
    const verdict = JSON.parse(jsonMatch[0]) as {
      match: boolean;
      confidence: number;
      reason?: string;
    };
    return Response.json({
      configured: true,
      match: !!verdict.match,
      confidence: Math.max(0, Math.min(1, Number(verdict.confidence) || 0)),
      reason: verdict.reason ?? "",
    });
  } catch {
    return Response.json({ error: "parse_failed", raw: r.text.slice(0, 300) }, { status: 502 });
  }
}
