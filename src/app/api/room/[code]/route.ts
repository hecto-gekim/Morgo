// 방 상태 조회 — 클라이언트가 폴링해 준실시간으로 멤버/지출을 동기화한다.

import { readRoom } from "@/lib/room-store";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const room = await readRoom(code.toUpperCase());
  if (!room) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ room });
}
