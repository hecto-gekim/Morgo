// 서버 전용 Claude(Anthropic Messages API) 호출 헬퍼.
// 키는 CLAUDE_API_KEY 환경변수로만 사용한다(gemini.ts와 동일한 보안 원칙).
// 강점: 지시 준수·안전 규칙 준수·창의적 글쓰기 → 룰렛 챌린지 "작성"과 사진 판정 폴백에 쓴다.

// 최신 Opus. thinking 미지정이면 4.8은 사고 없이 바로 답하므로 짧은 JSON 생성에 적합.
const CLAUDE_MODEL = process.env.MORGO_CLAUDE_MODEL ?? "claude-opus-4-8";

export type ClaudeResult =
  | { ok: true; text: string }
  | { ok: false; status?: number; detail: string };

interface ClaudeImage {
  mediaType: string;
  data: string; // base64 (dataURL 접두사 제외)
}

/**
 * Claude Messages API 호출. image가 있으면 비전 판정에 쓴다.
 * 반환 text는 모델의 text 블록만 이어붙인 것.
 */
export async function callClaude(
  apiKey: string,
  prompt: string,
  opts?: { system?: string; maxTokens?: number; image?: ClaudeImage },
): Promise<ClaudeResult> {
  const content: Record<string, unknown>[] = [];
  if (opts?.image) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: opts.image.mediaType,
        data: opts.image.data,
      },
    });
  }
  content.push({ type: "text", text: prompt });

  const body: Record<string, unknown> = {
    model: CLAUDE_MODEL,
    max_tokens: opts?.maxTokens ?? 1024,
    messages: [{ role: "user", content }],
  };
  if (opts?.system) body.system = opts.system;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, detail: (await res.text()).slice(0, 400) };
    }
    const data = await res.json();
    const text = (data?.content ?? [])
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("");
    return { ok: true, text };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "request_failed" };
  }
}
