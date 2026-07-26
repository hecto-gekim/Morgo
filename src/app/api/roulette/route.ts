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
  /** 공포 모드 — true면 전부 괴담/공포 컨셉으로만 생성 */
  horror?: boolean;
}

interface Challenge {
  title: string;
  description: string;
  emoji: string;
  points: number;
  category: "DARE" | "PLACE" | "HORROR";
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
  const horror = !!body.horror;

  const prompt =
    (horror
      ? `너는 공포 컨셉 여행 예능 PD야. 지금 여행자가 "${body.city}"(${body.province ?? ""})에 뚝 떨어졌어.\n` +
        `구글 검색으로 이 지역의 실제 괴담·소문·으스스한 명소를 찾아본 뒤,\n` +
        `모두 category를 "HORROR"로만, 완전히 괴담/공포 컨셉인 "도착 룰렛" 챌린지 ${count}개를 만들어줘.\n\n`
      : `너는 자극적인 여행 예능 PD야. 지금 여행자가 "${body.city}"(${body.province ?? ""})에 뚝 떨어졌어.\n` +
        `구글 검색으로 이 지역의 실제 명소·맛집·카페·특산물을 찾아본 뒤,\n` +
        `보는 사람이 "저건 나라면 못 해ㅋㅋ" 싶을 만큼 자극적이고 어그로 끌리는 "도착 룰렛" 챌린지 ${count}개를 만들어줘.\n\n`) +
    `규칙 (반드시 지킬 것):\n` +
    `- 실제로 5~30분 안에 혼자서도 할 수 있는 행동일 것 (사진 인증 가능)\n` +
    `- 위험하거나, 남에게 민폐이거나, 불법이거나, 돈이 많이 드는 것은 절대 금지 — 자극은 "민망함·텐션·의외성"으로만 낸다\n` +
    `- 폐가·흉가·공사장 등 출입 금지/사유지 무단 진입은 절대 포함하지 말 것. 야간 골목·폐업한 가게 등은 "안에 들어가지 않고 바깥에서만" 인증하는 식으로만 쓸 것\n` +
    `- 모르는 사람을 따라가기/미행하기, 동의 없이 신체 접촉(하이파이브·포옹 등) 시도, 몰래 사진/영상 촬영처럼 타인에게 불안감을 주거나 스토킹으로 오해될 수 있는 챌린지는 절대 만들지 말 것 — 낯선 사람과 엮을 땐 "말을 걸어 질문하기" 같은 비접촉·즉시종료 가능한 상호작용만 허용\n` +
    `- 절반 정도는 이 도시의 실제 장소/특색을 살릴 것 (검색으로 찾은 진짜 가게·명소 이름 사용 OK)\n` +
    (horror
      ? `- 전부 category를 "HORROR"로 할 것 (위 안전 규칙 안에서 괴담·소문·으스스한 분위기 중심)\n`
      : `- ${count}개 중 1~2개는 category를 "HORROR"(괴담/으스스한 밤 컨셉, 위 안전 규칙 안에서)로 섞어줘\n`) +
    `- 참고: 대표 명소 ${body.landmark ?? "?"}, 지역 음식 ${body.food ?? "?"}\n` +
    `- 제목은 후킹되게 도발적으로, 설명은 클릭베이트 예능 자막처럼 쓸 것. 뻔한 "인증샷 찍기" 금지\n` +
    (exclude.length ? `- 다음 제목들과 겹치지 않게: ${exclude.join(", ")}\n` : "") +
    `\n각 챌린지는 아래 JSON 배열로만 답해(다른 설명 문장 없이):\n` +
    `[{"title":"짧고 자극적인 제목","description":"예능 자막 톤 한 문장","emoji":"이모지 1개","points":15~35 정수,"category":"DARE 또는 PLACE 또는 HORROR"}]`;

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
        category:
          c.category === "PLACE" || c.category === "HORROR" ? c.category : "DARE",
      }));
    return Response.json({ configured: true, challenges });
  } catch {
    return Response.json({ error: "parse_failed", raw: r.text.slice(0, 300) }, { status: 502 });
  }
}
