# Morgo (모르고)

목적지는 모른 채 숙소만 보고 고르는 블라인드 랜덤 여행 웹앱.
상세 기획은 [Morgo_개발_명세서.md](./Morgo_개발_명세서.md) 참고.

## 실행

```bash
npm install
npm run dev   # http://localhost:4000
```

## 현재 상태 — Phase 1 (UI 우선)

- 스택: Next.js(App Router) + TypeScript + Tailwind CSS + zustand
- 데이터: `src/lib/seed.ts` 시드 데이터 (10개 도시 × 3개 숙소)
- 상태: zustand + localStorage 저장 (`morgo-store`) — 백엔드/DB 없음
- 구현된 흐름: 로그인 → 조건 입력(6단계) → 블라인드 숙소 카드 → 1~3순위 선택
  → 테스트 결제 → 가짜 예약(MORGO-예약번호) → 카운트다운 → 목적지 공개
- 지도·미션 탭은 Phase 4/5 placeholder

## 구조

```
src/
  lib/
    types.ts   도메인 타입 (명세서 13장 상태값 등)
    seed.ts    도시·숙소 시드 데이터
    logic.ts   거리 계산, 도시 선정(명세서 8장), 공개 시각, 예약번호
    store.ts   zustand 스토어 (user, trips)
  components/  BottomNav, AppShell(로그인 가드), BlindCard, Countdown 등
  app/
    login/               이메일 로그인 (알파: 인증 없음)
    page.tsx             홈
    trip/new/            여행 조건 입력 위저드
    trip/[id]/offers/    블라인드 숙소 후보 + 우선순위
    trip/[id]/payment/   테스트 결제
    trip/[id]/complete/  예약 완료
    trip/[id]/           카운트다운 / 목적지 공개 (개발용 즉시 공개 버튼 있음)
    trips|map|missions|me/  하단 탭
```

## 다음 단계 (Phase 2~)

- Docker + PostgreSQL + Prisma 도입, API Route로 로직 서버 이전
- 네이버 지역 검색 API 연동(키 필요) + 관리자 숙소 등록
- 블라인드 정보 노출 방지를 서버 응답 레벨에서 보장 (명세서 23.2)
