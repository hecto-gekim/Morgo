"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHydrated, useMorgo } from "@/lib/store";
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
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

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
