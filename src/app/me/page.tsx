"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useMorgo } from "@/lib/store";

export default function MePage() {
  return (
    <AppShell>
      <MeContent />
    </AppShell>
  );
}

function MeContent() {
  const router = useRouter();
  const user = useMorgo((s) => s.user)!;
  const trips = useMorgo((s) => s.trips);
  const cityRecords = useMorgo((s) => s.cityRecords);
  const logout = useMorgo((s) => s.logout);

  const visitedCount = Object.keys(cityRecords).length;
  const points = trips
    .flatMap((t) => t.missions ?? [])
    .filter((m) => m.status === "PASSED")
    .reduce((n, m) => n + m.mission.points, 0);

  return (
    <div>
      <h1 className="text-xl font-extrabold">마이</h1>
      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-morgo-card p-5 shadow-sm">
        <Image
          src="/character/happy.png"
          alt="프로필 캐릭터"
          width={56}
          height={56}
          className="rounded-full"
        />
        <div>
          <div className="font-bold">{user.nickname}</div>
          <div className="text-sm text-morgo-navy/55">{user.email}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <MeStat value={trips.length} label="만든 여행" />
        <MeStat
          value={trips.filter((t) => t.status === "COMPLETED").length}
          label="완료한 여행"
        />
        <MeStat value={visitedCount} label="방문 도시" />
        <MeStat value={`${points}P`} label="미션 포인트" />
      </div>

      <button
        type="button"
        onClick={() => {
          logout();
          router.replace("/login");
        }}
        className="mt-6 w-full rounded-xl border border-morgo-navy/15 bg-morgo-card py-3.5 font-semibold text-morgo-navy/70"
      >
        로그아웃
      </button>
      <p className="mt-4 text-center text-[11px] text-morgo-navy/40">
        Morgo 알파 버전 · 테스트 예약 전용
      </p>
    </div>
  );
}

function MeStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl bg-morgo-card p-4 text-center shadow-sm">
      <div className="text-2xl font-extrabold text-morgo-pink">{value}</div>
      <div className="mt-0.5 text-xs text-morgo-navy/55">{label}</div>
    </div>
  );
}
