"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHydrated, useMorgo } from "@/lib/store";
import { useKoreaRegions } from "@/lib/useKoreaRegions";
import BottomNav from "./BottomNav";

/** 로그인 가드 + 하단 탭 레이아웃 셸 */
export default function AppShell({
  children,
  maxWidth = "max-w-3xl",
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const hydrated = useHydrated();
  const user = useMorgo((s) => s.user);
  const horrorMode = useMorgo((s) => s.horrorMode);
  const router = useRouter();
  // 전국 시군구 도시 레지스트리 등록(핀 던지기·미션 등에서 도시 조회에 필요) — 어느 페이지든 진입 시 1회
  useKoreaRegions();

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  // 공포 모드 on/off를 <html data-theme> 에 동기화 (외부 시스템=DOM 이므로 useEffect가 적절)
  useEffect(() => {
    document.documentElement.dataset.theme = horrorMode ? "horror" : "";
  }, [horrorMode]);

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-morgo-navy/40">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-morgo-cream">
      <BottomNav />
      <main
        className={`mx-auto ${maxWidth} px-4 pt-4 pb-24 md:pt-20 md:pb-10`}
      >
        {children}
      </main>
    </div>
  );
}
