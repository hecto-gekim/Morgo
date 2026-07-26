// 서버 전용 Gemini(Google AI Studio) 호출 헬퍼.
// 키는 GEMINI_API_KEY 환경변수로만 사용한다(명세서 24 보안).

const GEMINI_MODEL = process.env.MORGO_GEMINI_MODEL ?? "gemini-3.5-flash";

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; status?: number; detail: string };

/**
 * Gemini generateContent 호출.
 * opts.search=true 면 Google 검색 그라운딩(실시간 검색)을 켠다.
 */
export async function callGemini(
  apiKey: string,
  parts: GeminiPart[],
  opts?: { search?: boolean; maxOutputTokens?: number },
): Promise<GeminiResult> {
  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: { maxOutputTokens: opts?.maxOutputTokens ?? 1024 },
  };
  if (opts?.search) body.tools = [{ google_search: {} }];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      return { ok: false, status: res.status, detail: (await res.text()).slice(0, 400) };
    }
    const data = await res.json();
    const parts2 = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts2
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    return { ok: true, text };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "request_failed" };
  }
}
