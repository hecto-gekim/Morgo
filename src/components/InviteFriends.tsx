"use client";

import Link from "next/link";
import { useState } from "react";
import { getDeviceId } from "@/lib/device";
import { createRoom } from "@/lib/room-client";
import { getCity } from "@/lib/seed";
import { useMorgo } from "@/lib/store";
import type { Trip } from "@/lib/types";

/**
 * 여행 화면의 "친구 초대" 블록.
 * 방을 만들면 코드/링크가 생기고, 친구는 로그인 없이 링크로 참여해
 * 미션을 함께 보고 지출을 정산할 수 있다.
 */
export default function InviteFriends({ trip }: { trip: Trip }) {
  const user = useMorgo((s) => s.user);
  const setTripRoomCode = useMorgo((s) => s.setTripRoomCode);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const code = trip.roomCode;
  const link =
    code && typeof window !== "undefined"
      ? `${window.location.origin}/room/${code}`
      : "";

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom({
        cityId: trip.cityId,
        cityName: getCity(trip.cityId)?.name ?? "여행",
        theme: trip.theme ?? (trip.horrorSpot ? "horror" : "normal"),
        missions: (trip.missions ?? []).map((m) => ({
          id: m.mission.id,
          title: m.mission.title,
          emoji: m.mission.emoji,
          points: m.mission.points,
        })),
        hostId: getDeviceId(),
        hostName: user?.nickname?.trim() || "나",
      });
      setTripRoomCode(trip.id, room.code);
    } catch {
      setError("방을 만들지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setCreating(false);
    }
  };

  const share = async () => {
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Morgo 같이 가요", url: link });
        return;
      }
    } catch {
      // 공유 취소 등은 무시하고 복사로 폴백
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("링크 복사에 실패했어요. 주소를 길게 눌러 복사해주세요.");
    }
  };

  return (
    <section className="mt-4 rounded-2xl bg-morgo-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg">🧑‍🤝‍🧑</span>
        <h2 className="font-bold">친구랑 같이 가기</h2>
      </div>

      {!code ? (
        <>
          <p className="mt-1 text-sm text-morgo-navy/55">
            초대 링크를 보내면 친구가 로그인 없이 들어와 미션을 함께 보고 돈도
            같이 정산할 수 있어요.
          </p>
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="mt-3 w-full rounded-xl bg-morgo-navy py-3.5 font-bold text-white active:bg-morgo-navy-deep disabled:opacity-60"
          >
            {creating ? "방 만드는 중…" : "친구 초대방 만들기"}
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-morgo-navy/55">
            방 코드 <span className="font-bold text-morgo-navy">{code}</span> · 이
            링크를 친구에게 보내세요.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={share}
              className="flex-1 rounded-xl bg-morgo-navy py-3 font-bold text-white active:bg-morgo-navy-deep"
            >
              {copied ? "복사됨!" : "초대 링크 공유"}
            </button>
            <Link
              href={`/room/${code}`}
              className="flex-1 content-center rounded-xl border border-morgo-navy/15 py-3 text-center font-bold text-morgo-navy/70"
            >
              방 보기
            </Link>
          </div>
        </>
      )}

      {error && <p className="mt-2 text-sm text-morgo-pink">{error}</p>}
    </section>
  );
}
