// 방 참여 — 이름만 입력해 멤버로 등록(로그인 없음). 이미 있으면 이름만 갱신.

import { updateRoom } from "@/lib/room-store";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  let body: { id?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const name = String(body.name ?? "").trim().slice(0, 20);
  if (!id || !name) {
    return Response.json({ error: "missing_member" }, { status: 400 });
  }

  const room = await updateRoom(code.toUpperCase(), (r) => {
    const existing = r.members.find((m) => m.id === id);
    if (existing) {
      existing.name = name;
    } else {
      r.members.push({ id, name, joinedAt: new Date().toISOString() });
    }
  });
  if (!room) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ room });
}
