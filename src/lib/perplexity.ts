// 서버 전용 Perplexity(sonar) 호출 헬퍼. 키는 PERPLEXITY_API_KEY.
// 강점: 실시간 웹검색 + 로컬 정보 → 룰렛에서 "이 지역의 실제 장소/괴담 명소"를
// 사실 조사하는 단계에 쓴다. (OpenAI 호환 chat/completions 스키마)

// 웹검색 품질이 더 좋은 sonar-pro를 기본으로. 필요 시 MORGO_PERPLEXITY_MODEL로 교체.
const PERPLEXITY_MODEL = process.env.MORGO_PERPLEXITY_MODEL ?? "sonar-pro";

export type PerplexityResult =
  | { ok: true; text: string }
  | { ok: false; status?: number; detail: string };

export async function callPerplexity(
  apiKey: string,
  prompt: string,
  opts?: { maxTokens?: number },
): Promise<PerplexityResult> {
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        max_tokens: opts?.maxTokens ?? 700,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, detail: (await res.text()).slice(0, 400) };
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "request_failed" };
  }
}
