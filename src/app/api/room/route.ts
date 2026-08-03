// 친구 초대 방 생성 — 여행 스냅샷으로 방을 만들고 방장을 첫 멤버로 등록한다.
// 로그인 없이 브라우저가 만든 hostId로 멤버를 식별한다.

import { allocateCode, writeRoom } from "@/lib/room-store";
import type { Room, RoomMission, TripTheme } from "@/lib/types";

const THEMES: TripTheme[] = ["normal", "horror", "parents", "baby"];

function sanitizeMissions(input: unknown): RoomMission[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 20).map((m) => ({
    id: String(m?.id ?? ""),
    title: String(m?.title ?? "미션").slice(0, 60),
    emoji: String(m?.emoji ?? "🎲").slice(0, 4),
    points: Math.max(0, Math.round(Number(m?.points) || 0)),
  }));
}

export async function POST(request: Request) {
  let body: {
    cityId?: string;
    cityName?: string;
    theme?: TripTheme;
    missions?: unknown;
    hostId?: string;
    hostName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const hostId = String(body.hostId ?? "").trim();
  const hostName = String(body.hostName ?? "").trim().slice(0, 20);
  if (!hostId || !hostName) {
    return Response.json({ error: "missing_host" }, { status: 400 });
  }

  const theme: TripTheme = THEMES.includes(body.theme as TripTheme)
    ? (body.theme as TripTheme)
    : "normal";

  const now = new Date().toISOString();
  const code = await allocateCode();
  const room: Room = {
    code,
    createdAt: now,
    cityId: String(body.cityId ?? ""),
    cityName: String(body.cityName ?? "여행").slice(0, 40),
    theme,
    missions: sanitizeMissions(body.missions),
    members: [{ id: hostId, name: hostName, joinedAt: now }],
    expenses: [],
  };
  await writeRoom(room);
  return Response.json({ room });
}
