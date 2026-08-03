"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import CharacterImage from "@/components/CharacterImage";
import { formatDateKo } from "@/lib/logic";
import { useMorgo } from "@/lib/store";

export default function CompletePage() {
  return (
    <AppShell>
      <CompleteContent />
    </AppShell>
  );
}

function CompleteContent() {
  const { id } = useParams<{ id: string }>();
  const trip = useMorgo((s) => s.trips.find((t) => t.id === id));

  if (!trip?.booking) {
    return (
      <p className="py-20 text-center text-morgo-navy/40">
        예약 정보를 찾을 수 없어요.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-xl text-center">
      <CharacterImage
        src="/character/thrilled.png"
        alt="두근두근한 모로고"
        width={130}
        height={130}
        priority
        className="mx-auto mt-6 rounded-3xl"
      />
      <h1 className="mt-4 text-2xl font-extrabold">예약이 완료되었어요!</h1>
      <p className="mt-2 text-sm text-morgo-navy/55">
        테스트 예약이 완료되었습니다.
        <br />
        실제 숙박 시설에는 예약되지 않습니다.
      </p>

      <div className="mt-6 rounded-2xl bg-morgo-card p-5 text-left shadow-sm">
        <div className="flex justify-between py-1.5 text-sm">
          <span className="text-morgo-navy/55">예약번호</span>
          <span className="font-mono font-bold">
            {trip.booking.bookingNumber}
          </span>
        </div>
        <div className="flex justify-between py-1.5 text-sm">
          <span className="text-morgo-navy/55">체크인</span>
          <span className="font-medium">
            {formatDateKo(trip.conditions.checkInDate)}
          </span>
        </div>
        <div className="flex justify-between py-1.5 text-sm">
          <span className="text-morgo-navy/55">목적지</span>
          <span className="font-bold text-morgo-pink">
            출발 당일 오전 3시 공개 🔒
          </span>
        </div>
      </div>

      <Link
        href={`/trip/${trip.id}`}
        className="mt-6 block min-h-[52px] w-full content-center rounded-xl bg-morgo-navy font-bold text-white"
      >
        카운트다운 보러 가기
      </Link>
      <Link href="/" className="mt-3 block py-2 text-sm text-morgo-navy/50">
        홈으로
      </Link>
    </div>
  );
}
