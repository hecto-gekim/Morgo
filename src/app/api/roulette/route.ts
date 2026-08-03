// 도착 룰렛 챌린지 생성 — AI별 강점에 맞춘 2단계 파이프라인.
//
// 1) 조사: Perplexity(sonar)가 웹검색으로 "이 도시 행정구역 안"의 실제 명소·맛집·
//    괴담 장소를 사실 수집한다. (PERPLEXITY_API_KEY 없으면 이 단계 생략)
// 2) 작성: Claude(opus)가 그 사실을 근거로 안전 규칙·예능 톤·지역 고정을 지켜
//    챌린지 JSON을 만든다. (CLAUDE_API_KEY 없으면 Gemini 검색 폴백)
// 둘 다 없으면 { configured:false } → 클라이언트 로컬 덱 폴백.

import { callClaude } from "@/lib/claude";
import { callGemini } from "@/lib/gemini";
import { callPerplexity } from "@/lib/perplexity";
import type { TripTheme } from "@/lib/types";

interface RouletteBody {
  city: string;
  province?: string;
  food?: string;
  landmark?: string;
  exclude?: string[]; // 이미 나온 제목들 (중복 방지)
  count?: number;
  /** 여행 테마 — 미션 톤/카테고리 결정 ("horror"면 괴담 전용) */
  theme?: TripTheme;
  /** (구버전 호환) 공포 모드 — theme이 없을 때만 참고 */
  horror?: boolean;
}

interface Challenge {
  title: string;
  description: string;
  emoji: string;
  points: number;
  category: "DARE" | "PLACE" | "HORROR";
}

interface HorrorSpotRaw {
  name: string;
  description: string;
}

/** Perplexity 조사 프롬프트 — 반드시 해당 행정구역 안의 실제 장소만 */
function researchPrompt(body: RouletteBody, horror: boolean): string {
  const full = `${body.province ?? ""} ${body.city}`.trim();
  return (
    `대한민국 "${full}" 한 곳만 웹검색해서, 그 지역 안에 실제로 있는 장소를 정리해줘.\n` +
    `조사 대상 도시는 오직 "${body.city}"이다. "${body.city}"이(가) 아닌 다른 시·군·도(예: 세종·경산·제주·서울 등)는 검색도 언급도 절대 하지 마라.\n` +
    `- "${body.city}"의 유명 명소·거리, 로컬 맛집, 카페, 특산물/길거리 간식을 합쳐 6~8개.\n` +
    `- 형식: 각 줄 "[${body.city}] 이름 — 한 줄 특징" (대괄호 안 도시명이 "${body.city}"가 아니면 그 줄은 넣지 마라).\n` +
    (horror
      ? `- 마지막 줄에 "${body.city}" 안에서 소문난 실제 공포/괴담 장소 1곳을 "SPOT: [${body.city}] 이름 — 왜 무서운지 1문장".\n`
      : "") +
    `설명 문장 없이 목록만.`
  );
}

/** 테마별 도입부(페르소나 + 주문) */
function themeIntro(theme: TripTheme, where: string, count: number): string {
  if (theme === "horror") {
    return (
      `너는 한국의 폐가·흉가·공포체험지를 꿰고 있는 "공포 미션 디자이너"다. 지금 여행자가 "${where}"에 뚝 떨어졌어.\n` +
      `그 지역의 실제 특징(구조물·분위기·떠도는 소문·대표 포인트)을 살린, 사진 인증 필수의 "도착 룰렛" 공포 미션 ${count}개를 만들어줘 (전부 category "HORROR").\n\n`
    );
  }
  if (theme === "parents") {
    return (
      `너는 부모님과의 효도여행을 세심하게 설계하는 다정한 여행 가이드다. 지금 여행자가 "${where}"에 부모님과 함께 도착했어.\n` +
      `부모님(중장년·노년)과 함께 무리 없이 하면서 마음이 따뜻해지는, 사진으로 남길 만한 "도착 룰렛" 미션 ${count}개를 만들어줘.\n\n`
    );
  }
  if (theme === "baby") {
    return (
      `너는 아기 동반 가족여행을 돕는 전문가다. 지금 여행자가 "${where}"에 어린 아기와 함께 도착했어.\n` +
      `아기와 함께 안전하고 편하게 할 수 있는, 실용적이면서 추억이 되는 "도착 룰렛" 미션 ${count}개를 만들어줘.\n\n`
    );
  }
  return (
    `너는 센스 있는 여행 예능 PD야. 지금 여행자가 "${where}"에 뚝 떨어졌어.\n` +
    `해보면 "오 이거 은근 하고 싶다" 싶은, 살짝 도전적이면서 재밌고 의외성 있는 "도착 룰렛" 챌린지 ${count}개를 만들어줘.\n\n`
  );
}

/** 테마별 추가 규칙 블록 (공통 안전 규칙 뒤에 붙는다) */
function themeRules(theme: TripTheme): string {
  if (theme === "parents") {
    return (
      `- category는 전부 "DARE" 또는 "PLACE"만 써라. "HORROR"는 절대 섞지 마라.\n` +
      `- 부모님이 무리 없이 할 수 있는 것만 — 가파른 등산·오래 걷기·시끄럽거나 과격한 미션 금지.\n` +
      `- 효도·대화·추억·함께 찍는 사진·부모님 취향의 맛집/찻집 중심으로. 유치하거나 오글거리는 챌린지는 절대 금지, 진심 어린 어른 톤으로.\n`
    );
  }
  if (theme === "baby") {
    return (
      `- category는 전부 "DARE" 또는 "PLACE"만 써라. "HORROR"는 절대 섞지 마라.\n` +
      `- 영유아를 동반한 부모가 할 수 있는 것만 — 아기에게 위험하거나 무리한 것 금지.\n` +
      `- 수유실·기저귀 교환대·유아 의자·그늘·유모차 동선·낮잠 자리 같은 안전·편의를 챙기는 실용 미션 중심으로. 따뜻하고 담백하게.\n`
    );
  }
  // normal
  return (
    `- category는 전부 "DARE" 또는 "PLACE"만 써라. "HORROR"(괴담/공포 컨셉)는 절대 섞지 마라 — 지금은 일반 모드다.\n` +
    `- 유치하거나 오글거리는 챌린지는 피하고, 어른도 "오 이거 해보고 싶다" 싶은 센스 있는 것으로.\n`
  );
}

/** Claude/Gemini 공용 작성 프롬프트 — 지역 고정 + 안전 규칙 + 테마별 미션 톤 */
function authorPrompt(
  body: RouletteBody,
  theme: TripTheme,
  count: number,
  exclude: string[],
  facts: string,
): string {
  const horror = theme === "horror";
  const where = `${body.city}(${body.province ?? ""})`;
  return (
    themeIntro(theme, where, count) +
    `【지역 검증 — 최우선 규칙】 너는 대한민국 지리를 잘 안다. 이 챌린지는 오직 "${body.city}"(${body.province ?? ""})용이다.\n` +
    `- "${body.city}"이(가) 아닌 다른 도시(세종·경산·제주·서울 등)의 장소는 절대 등장시키지 마라. 네가 확실히 아는 "${body.city}"의 실제 명소·거리·특색을 우선 활용하라.\n` +
    `- "${body.city}"의 특정 장소가 확실치 않으면 이름을 지어내지 말고 "이 동네", "근처", "이 지역"으로만 표현하라.\n\n` +
    (facts
      ? `【참고 자료 — 틀릴 수 있으니 위 지역 검증 규칙을 반드시 우선 적용】\n아래 목록에서 대괄호 도시명이 "${body.city}"인 항목만 신뢰해 써라. "${body.city}"가 아닌 항목(다른 도시)이 섞여 있으면 잘못된 자료이므로 전부 버려라.\n${facts}\n\n`
      : "") +
    `규칙 (반드시 지킬 것):\n` +
    `- 실제로 5~30분 안에 혼자서도 할 수 있는 행동일 것 (사진 인증 가능)\n` +
    `- 위험·민폐·불법·고비용은 절대 금지 — 자극은 "민망함·텐션·의외성"으로만 낸다\n` +
    `- 폐가·흉가·공사장 등 출입 금지/사유지 무단 진입 금지. 야간 골목·폐업 가게 등은 "안에 들어가지 않고 바깥에서만" 인증.\n` +
    `- 모르는 사람 미행/따라가기, 동의 없는 신체 접촉, 몰래 촬영처럼 타인에게 불안감을 주는 챌린지 절대 금지. 낯선 사람과는 "말 걸어 질문하기" 같은 비접촉·즉시종료 상호작용만.\n` +
    (horror
      ? `- 전부 category를 "HORROR"로 (위 안전 규칙 안에서 괴담·소문·으스스한 분위기 중심)\n` +
        `- 【장소 반영】 가능하면 그 지역/명소의 실제 특징(구조물·간판·조형물·소문·대표 포인트)을 하나씩 콕 집어 미션에 녹여라. 확실치 않으면 지어내지 말고 "이 동네·근처·이 지역"으로.\n` +
        `- 【사진 인증 기준 필수】 각 description 안에 "무엇이 사진에 반드시 나와야 하는지"를 한 조각 넣어라 (예: "○○ 간판과 내 그림자가 한 프레임에", "시계의 4:44가 또렷이 보이게"). 장소·요소가 안 보이면 인증 실패라는 걸 문구로 암시.\n` +
        `- 【난이도 분산】 points로 난이도를 나눠라 — 초급 15~20(그 자리에서 바로), 중급 25~30(조금 이동·연출), 고급 32~35(명소까지 가거나 특정 시각). ${count}개가 세 난이도에 고루 퍼지게.\n` +
        `- 뻔하고 시시한 유형 금지: "무서운 표정 짓기", "폐업/문 닫은 가게 앞에서 인증샷", "지나가는 사람에게 무서운 이야기 물어보기" 같은 건 절대 넣지 마라.\n` +
        `- 대신 "분위기·정적·숫자·시간·반사·그림자·소리" 같은 오싹한 디테일로 텐션을 만들어라. 혼자서도 몰입되는 짧은 의식(ritual) 느낌으로.\n` +
        `- 다음 두 종류를 각각 최소 1개씩 반드시 포함:\n` +
        `  · 정확한 "시각"을 콕 집는 미션 (예: "정확히 4시 44분에 편의점 도착해 인증" — 44는 죽을 사死 컨셉). "심야에" 같은 뭉뚱그림 말고 정확한 시각으로. 새벽 시간대는 안전을 위해 편의점·24시 매장처럼 밝고 사람 있는 곳만.\n` +
        `  · 이 지역의 실제 공포/괴담 명소로 "가는" 미션. 단 폐가·흉가·사유지 안에는 절대 들어가지 말고 밝은 도로변 바깥에서만 인증하도록 문구를 쓸 것.\n`
      : themeRules(theme)) +
    `- 절반 정도는 이 도시의 실제 장소/특색을 살릴 것 (위 실제 정보의 진짜 가게·명소 이름 사용 OK)\n` +
    `- 참고: 대표 명소 ${body.landmark ?? "?"}, 지역 음식 ${body.food ?? "?"}\n` +
    (theme === "parents" || theme === "baby"
      ? `- 제목은 따뜻하고 담백하게, 설명은 다정한 안내 톤 한 문장. 뻔한 "인증샷 찍기" 식 표현은 피할 것\n`
      : `- 제목은 후킹되게 도발적으로, 설명은 클릭베이트 예능 자막처럼. 뻔한 "인증샷 찍기" 금지\n`) +
    (exclude.length ? `- 다음 제목들과 겹치지 않게: ${exclude.join(", ")}\n` : "") +
    (horror
      ? `\n추가로: "${body.city}" 안의 실존 공포·괴담 명소 딱 1곳을 spot 필드에 담아줘(다른 지역 금지). spot.description은 왜 무서운지 1~2문장.\n`
      : "") +
    `\n아래 JSON 객체 하나로만 답해(다른 설명 문장 없이):\n` +
    `{"challenges":[{"title":"짧고 자극적인 제목","description":"예능 자막 톤 한 문장","emoji":"이모지 1개","points":15~35 정수,"category":"DARE 또는 PLACE 또는 HORROR"}]` +
    (horror ? `,"spot":{"name":"명소 이름","description":"1~2문장 설명"}` : "") +
    `}`
  );
}

/**
 * 조사 결과에서 요청한 도시로 태그된 줄만 남긴다(결정적 지역 가드).
 * Perplexity가 엉뚱한 도시를 물어와도 여기서 전부 걸러져 facts가 비고,
 * 그러면 작성 단계는 Claude 자체 지식 + 지역 고정 규칙으로만 생성한다.
 */
function filterFactsToCity(facts: string, city: string): string {
  if (!facts) return "";
  const tag = `[${city}]`;
  return facts
    .split("\n")
    .filter((line) => line.includes(tag))
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  const claudeKey = process.env.CLAUDE_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  // 챌린지를 "작성"할 수 있는 모델이 하나도 없으면 로컬 폴백
  if (!claudeKey && !geminiKey) return Response.json({ configured: false });

  let body: RouletteBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const count = Math.min(Math.max(body.count ?? 10, 1), 15);
  const exclude = (body.exclude ?? []).slice(0, 40);
  // theme 우선, 없으면 구버전 horror 플래그로 폴백
  const theme: TripTheme = body.theme ?? (body.horror ? "horror" : "normal");
  const horror = theme === "horror";

  // 1) 조사 (Perplexity) — 실패하거나 키 없으면 빈 문자열로 진행
  let facts = "";
  if (perplexityKey) {
    const r = await callPerplexity(perplexityKey, researchPrompt(body, horror), {
      maxTokens: 700,
    });
    // 요청 도시로 태그된 줄만 채택 — 엉뚱한 도시 결과는 여기서 전부 버려진다
    if (r.ok) facts = filterFactsToCity(r.text, body.city);
  }

  // 2) 작성 (Claude 우선, Gemini 폴백)
  const prompt = authorPrompt(body, theme, count, exclude, facts);
  let text = "";
  let author = "";
  if (claudeKey) {
    const r = await callClaude(claudeKey, prompt, { maxTokens: 2000 });
    if (r.ok && r.text.trim()) {
      text = r.text;
      author = "claude";
    }
  }
  if (!text && geminiKey) {
    // Gemini는 자체 검색 그라운딩도 켜서 폴백 품질을 보강
    const r = await callGemini(geminiKey, [{ text: prompt }], {
      search: true,
      maxOutputTokens: 6000,
    });
    if (r.ok && r.text.trim()) {
      text = r.text;
      author = "gemini";
    }
  }
  if (!text) {
    return Response.json({ error: "upstream_error" }, { status: 502 });
  }

  const objMatch = text.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    return Response.json({ error: "unparseable", raw: text.slice(0, 300) }, { status: 502 });
  }

  try {
    const raw = JSON.parse(objMatch[0]) as {
      challenges?: Challenge[];
      spot?: HorrorSpotRaw;
    };
    const challenges = (raw.challenges ?? [])
      .filter((c) => c?.title && c?.description)
      .map((c) => ({
        title: String(c.title).slice(0, 40),
        // 공포 미션은 "사진 인증 기준"까지 담기므로 설명을 조금 더 길게 허용
        description: String(c.description).slice(0, horror ? 160 : 120),
        emoji: (c.emoji || "🎲").slice(0, 4),
        points: Math.min(Math.max(Math.round(Number(c.points) || 20), 15), 35),
        category:
          // 일반 모드에선 HORROR를 절대 허용하지 않는다(모델이 어겨도 DARE로 강등)
          c.category === "PLACE"
            ? "PLACE"
            : horror && c.category === "HORROR"
              ? "HORROR"
              : "DARE",
      }));
    const spot =
      horror && raw.spot?.name && raw.spot?.description
        ? {
            name: String(raw.spot.name).slice(0, 40),
            description: String(raw.spot.description).slice(0, 160),
          }
        : undefined;
    return Response.json({
      configured: true,
      challenges,
      spot,
      providers: { research: perplexityKey && facts ? "perplexity" : null, author },
    });
  } catch {
    return Response.json({ error: "parse_failed", raw: text.slice(0, 300) }, { status: 502 });
  }
}
