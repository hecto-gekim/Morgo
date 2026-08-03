// 방 지출 추가/삭제 — 누가(payerId) 얼마(amount) 무엇에(label) 썼는지 기록.
// 정산 계산은 클라이언트에서 lib/settle 로 수행한다.

import { updateRoom } from "@/lib/room-store";
import type { RoomExpense } from "@/lib/types";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  let body: {
    payerId?: string;
    amount?: number;
    label?: string;
    missionId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const payerId = String(body.payerId ?? "").trim();
  const amount = Math.round(Number(body.amount) || 0);
  const label = String(body.label ?? "").trim().slice(0, 40);
  if (!payerId || amount <= 0) {
    return Response.json({ error: "invalid_expense" }, { status: 400 });
  }

  let created: RoomExpense | null = null;
  const room = await updateRoom(code.toUpperCase(), (r) => {
    // 결제자는 반드시 방 멤버여야 한다
    if (!r.members.some((m) => m.id === payerId)) return;
    const expense: RoomExpense = {
      id: `exp_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`,
      payerId,
      amount,
      label: label || "지출",
      missionId: body.missionId ? String(body.missionId) : undefined,
      createdAt: new Date().toISOString(),
    };
    r.expenses.push(expense);
    created = expense;
  });

  if (!room) return Response.json({ error: "not_found" }, { status: 404 });
  if (!created) return Response.json({ error: "not_a_member" }, { status: 403 });
  return Response.json({ room });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const expenseId = new URL(request.url).searchParams.get("expenseId");
  if (!expenseId) {
    return Response.json({ error: "missing_expense_id" }, { status: 400 });
  }
  const room = await updateRoom(code.toUpperCase(), (r) => {
    r.expenses = r.expenses.filter((e) => e.id !== expenseId);
  });
  if (!room) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ room });
}
