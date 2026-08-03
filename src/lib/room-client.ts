// 친구 초대 방 API 클라이언트 헬퍼. 모두 최신 Room 객체를 돌려주거나 throw 한다.

import type { Room, RoomMission, TripTheme } from "./types";

async function parseRoom(res: Response): Promise<Room> {
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.room) {
    throw new Error(data?.error ?? `request_failed_${res.status}`);
  }
  return data.room as Room;
}

export async function createRoom(input: {
  cityId: string;
  cityName: string;
  theme: TripTheme;
  missions: RoomMission[];
  hostId: string;
  hostName: string;
}): Promise<Room> {
  const res = await fetch("/api/room", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseRoom(res);
}

export async function fetchRoom(code: string): Promise<Room | null> {
  const res = await fetch(`/api/room/${code}`, { cache: "no-store" });
  if (res.status === 404) return null;
  return parseRoom(res);
}

export async function joinRoom(
  code: string,
  id: string,
  name: string,
): Promise<Room> {
  const res = await fetch(`/api/room/${code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, name }),
  });
  return parseRoom(res);
}

export async function addExpense(
  code: string,
  input: { payerId: string; amount: number; label: string; missionId?: string },
): Promise<Room> {
  const res = await fetch(`/api/room/${code}/expense`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseRoom(res);
}

export async function deleteExpense(
  code: string,
  expenseId: string,
): Promise<Room> {
  const res = await fetch(
    `/api/room/${code}/expense?expenseId=${encodeURIComponent(expenseId)}`,
    { method: "DELETE" },
  );
  return parseRoom(res);
}
