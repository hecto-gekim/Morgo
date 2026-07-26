"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { totalEarnedPoints } from "@/lib/logic";
import { useMorgo } from "@/lib/store";
import type { Rarity } from "@/lib/types";
import DartMapReveal from "./DartMapReveal";

/**
 * "지도에 핀 던지기" 연출 → 확정 시 즉석 랜덤 여행 생성 후 이동을 감싸는 트리거.
 * children이 open 콜백을 받아 원하는 모양의 버튼/링크를 자유롭게 렌더링한다.
 */
export default function RandomTripLauncher({
  children,
}: {
  children: (open: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const createInstantTrip = useMorgo((s) => s.createInstantTrip);
  const trips = useMorgo((s) => s.trips);
  const spentPoints = useMorgo((s) => s.spentPoints);
  const spendPoints = useMorgo((s) => s.spendPoints);
  const pityCount = useMorgo((s) => s.pityCount);
  const recordThrowRarity = useMorgo((s) => s.recordThrowRarity);
  const horrorMode = useMorgo((s) => s.horrorMode);
  const [open, setOpen] = useState(false);

  const pointsAvailable = totalEarnedPoints(trips) - spentPoints;

  const confirm = (cityId: string, rarity: Rarity) => {
    const id = createInstantTrip(cityId, rarity);
    setOpen(false);
    router.push(`/trip/${id}`);
  };

  return (
    <>
      {children(() => setOpen(true))}
      {open && (
        <DartMapReveal
          onConfirm={confirm}
          onClose={() => setOpen(false)}
          pointsAvailable={pointsAvailable}
          onSpendPoints={spendPoints}
          pityCount={pityCount}
          onThrowResult={recordThrowRarity}
          horror={horrorMode}
        />
      )}
    </>
  );
}
