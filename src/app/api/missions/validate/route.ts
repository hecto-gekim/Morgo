// 미션 사진 AI 판정 — AI별 강점에 맞춘 폴백 체인.
//
// 비전 판단은 GPT(gpt-4o)를 1순위로, 없으면 Claude 비전, 그다음 Gemini 비전 순.
// 셋 다 키가 없으면 { configured:false } → 클라이언트가 시뮬레이션 판정으로 폴백.

import { callClaude } from "@/lib/claude";
import { callGemini } from "@/lib/gemini";
import { callOpenAIVision } from "@/lib/openai";

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
  const gptKey = process.env.GPT_API_KEY;
  const claudeKey = process.env.CLAUDE_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!gptKey && !claudeKey && !geminiKey) return Response.json({ configured: false });

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

  // 폴백 체인: GPT 비전 → Claude 비전 → Gemini 비전
  let text = "";
  let judge = "";
  if (gptKey) {
    const r = await callOpenAIVision(gptKey, body.image, prompt, { maxTokens: 400 });
    if (r.ok && r.text.trim()) {
      text = r.text;
      judge = "gpt";
    }
  }
  if (!text && claudeKey) {
    const r = await callClaude(claudeKey, prompt, {
      image: { mediaType: parsed.mimeType, data: parsed.data },
      maxTokens: 400,
    });
    if (r.ok && r.text.trim()) {
      text = r.text;
      judge = "claude";
    }
  }
  if (!text && geminiKey) {
    const r = await callGemini(
      geminiKey,
      [
        { inline_data: { mime_type: parsed.mimeType, data: parsed.data } },
        { text: prompt },
      ],
      { maxOutputTokens: 1500 },
    );
    if (r.ok && r.text.trim()) {
      text = r.text;
      judge = "gemini";
    }
  }
  if (!text) {
    return Response.json({ error: "upstream_error" }, { status: 502 });
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return Response.json({ error: "unparseable", raw: text.slice(0, 300) }, { status: 502 });
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
      judge,
    });
  } catch {
    return Response.json({ error: "parse_failed", raw: text.slice(0, 300) }, { status: 502 });
  }
}
