// 공포 모드 '공포 명소 소환' — Perplexity로 "지금도 실제로 존재하는" 국내 유명 공포/괴담
// 명소를 웹검색해 후보를 돌려준다. 철거·리모델링·재개발로 사라진 곳은 제외.
// 지역(도/광역시 + 시·군·구)만 반환하고, 실제 도시 매칭은 레지스트리가 로드된 클라이언트에서 한다.

import { callPerplexity } from "@/lib/perplexity";

interface SpotCandRaw {
  name?: string;
  province?: string;
  city?: string;
  legend_type?: string;
  why?: string;
  status?: string;
  access_note?: string;
  sources?: { url?: string; date?: string }[];
  confidence?: string;
}

const PROMPT =
  `지금은 2026년 7월이다. 대한민국(서울 제외)의 공포·괴담 명소를 웹검색해 선정하라.\n\n` +
  `[선정 조건]\n` +
  `1. 2026년 현재 해당 장소·건물이 그대로 존재해야 한다.\n` +
  `2. 공도·공원 등 공개된 장소에서 외부 관찰이 가능해야 한다. 담장 내부·출입금지 구역 진입이 필요한 곳은 제외.\n` +
  `3. 현재 거주자가 있거나 영업 중인 건물은 제외.\n` +
  `4. 실제 참사 현장·유족 추모 공간은 제외.\n` +
  `5. 시·도별 최대 1곳.\n\n` +
  `[검증 규칙]\n` +
  `- 2025년 1월 이후 발행된 자료 2건 이상으로 교차확인. 미달 시 탈락.\n` +
  `- 철거·재개발·용도변경 여부를 지자체 고시 또는 뉴스로 별도 확인.\n` +
  `- 조건을 통과한 곳이 5곳 미만이면 억지로 채우지 말고 통과한 만큼만 반환하라.\n\n` +
  `[출력] JSON만:\n` +
  `{\n` +
  `  "spots": [{\n` +
  `    "name": "", "province": "", "city": "",\n` +
  `    "legend_type": "", "why": "",\n` +
  `    "status": "현존",\n` +
  `    "access_note": "합법적 접근 가능 범위 및 위험 요소",\n` +
  `    "sources": [{"url": "", "date": "YYYY-MM"}],\n` +
  `    "confidence": "high|medium"\n` +
  `  }],\n` +
  `  "excluded": [{"name": "", "reason": ""}]\n` +
  `}`;

// status/why에 사라졌다는 신호가 조금이라도 있으면 후보에서 제외
const GONE =
  /철거|해체|헐렸|헐림|리모델|재개발|재건축|사라|없어|없앰|없음|폐쇄|폐업|이전|불명|아파트|메워/;

// 교차확인 게이트: sources를 준 경우에만 "2025-01 이후 근거 2건 이상"을 요구한다.
// (모델이 sources를 아예 생략하면 이 검증은 건너뛰어 결과가 통째로 비는 걸 막는다)
function hasRecentSources(sources: SpotCandRaw["sources"]): boolean {
  if (!Array.isArray(sources) || sources.length === 0) return true;
  const recent = sources.filter((s) => {
    const d = String(s?.date ?? "");
    const m = d.match(/^(\d{4})-(\d{2})/);
    if (!m) return false;
    const ym = Number(m[1]) * 12 + Number(m[2]);
    return ym >= 2025 * 12 + 1; // 2025-01 이후
  });
  return recent.length >= 2;
}

export async function POST() {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return Response.json({ configured: false });

  // "명소 나올 때까지 재검색" — 서버에서 몇 번 재시도(후보를 여러 개 받아 클라 매칭 성공률↑)
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await callPerplexity(key, PROMPT, { maxTokens: 1600 });
    if (!r.ok) continue;
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) continue;
    try {
      const raw = JSON.parse(m[0]) as { spots?: SpotCandRaw[] };
      const spots = (raw.spots ?? [])
        .filter(
          (s) =>
            s?.name &&
            s?.province &&
            s?.city &&
            // 철거·용도변경 신호는 status·why·access_note 어디에 있어도 제외
            !GONE.test(`${s.status ?? ""} ${s.why ?? ""} ${s.access_note ?? ""}`) &&
            // 교차확인: sources가 왔다면 2025년 이후 근거 2건 이상만 통과(누락 시엔 통과시킴)
            hasRecentSources(s.sources),
        )
        .slice(0, 5)
        .map((s) => ({
          name: String(s.name).slice(0, 40),
          province: String(s.province).slice(0, 20),
          city: String(s.city).slice(0, 20),
          // 소환 결과 설명 = 괴담 요지 + (있으면) 접근 주의
          description: [s.why ?? "", s.access_note ? `⚠️ ${s.access_note}` : ""]
            .filter(Boolean)
            .join(" ")
            .slice(0, 160),
        }));
      if (spots.length) return Response.json({ configured: true, spots });
    } catch {
      // JSON 파싱 실패 → 다음 시도
    }
  }
  return Response.json({ configured: true, spots: [] });
}
