// 서버 전용 OpenAI(GPT) 호출 헬퍼. 키는 GPT_API_KEY.
// 강점: 비전(이미지 판단) → 미션 사진 판정의 1순위로 쓴다.

const GPT_MODEL = process.env.MORGO_GPT_MODEL ?? "gpt-4o";

export type OpenAIResult =
  | { ok: true; text: string }
  | { ok: false; status?: number; detail: string };

/**
 * GPT 비전 판정. imageDataUrl은 "data:image/...;base64,..." 형태 그대로 넘긴다
 * (OpenAI image_url은 dataURL을 그대로 받음).
 */
export async function callOpenAIVision(
  apiKey: string,
  imageDataUrl: string,
  prompt: string,
  opts?: { maxTokens?: number },
): Promise<OpenAIResult> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: GPT_MODEL,
        max_tokens: opts?.maxTokens ?? 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
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
