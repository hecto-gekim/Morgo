// 균등 정산 계산 — 지출 총액을 멤버 수로 나눠 각자 몫을 정하고,
// 낸 돈과 몫의 차이(잔액)를 최소 송금 횟수로 청산한다. (로그인 불필요, 순수 함수)

import type { RoomExpense, RoomMember, Settlement } from "./types";

export interface MemberBalance {
  memberId: string;
  /** 이 멤버가 실제로 낸 총액 */
  paid: number;
  /** 균등 분배 시 이 멤버가 부담해야 할 몫 */
  share: number;
  /** paid - share. 양수면 돌려받을 돈, 음수면 내야 할 돈 */
  net: number;
}

/** 원 단위 반올림 잔액 오차를 흡수하기 위한 임계값 (1원 미만은 청산된 것으로 본다) */
const EPSILON = 1;

/** 멤버별 낸 돈 / 몫 / 잔액 계산 (균등 분배) */
export function computeBalances(
  members: RoomMember[],
  expenses: RoomExpense[],
): MemberBalance[] {
  const n = members.length;
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  // 1원 단위로 나눠 떨어지지 않으면 나머지는 앞 멤버부터 1원씩 더 부담 (합이 정확히 total)
  const base = n > 0 ? Math.floor(total / n) : 0;
  let remainder = n > 0 ? total - base * n : 0;

  const paidByMember = new Map<string, number>();
  for (const e of expenses) {
    paidByMember.set(e.payerId, (paidByMember.get(e.payerId) ?? 0) + e.amount);
  }

  return members.map((m) => {
    const share = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    const paid = paidByMember.get(m.id) ?? 0;
    return { memberId: m.id, paid, share, net: paid - share };
  });
}

/**
 * 잔액을 최소 송금으로 청산하는 정산 목록.
 * 받을 사람(net>0)과 낼 사람(net<0)을 큰 것부터 그리디로 매칭한다.
 */
export function computeSettlements(
  members: RoomMember[],
  expenses: RoomExpense[],
): Settlement[] {
  const balances = computeBalances(members, expenses);
  // 소수/반올림 없이 정수원으로 다룬다
  const creditors = balances
    .filter((b) => b.net > EPSILON)
    .map((b) => ({ id: b.memberId, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = balances
    .filter((b) => b.net < -EPSILON)
    .map((b) => ({ id: b.memberId, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debt = debtors[di];
    const pay = Math.min(credit.amount, debt.amount);
    if (pay > EPSILON) {
      settlements.push({ fromId: debt.id, toId: credit.id, amount: pay });
    }
    credit.amount -= pay;
    debt.amount -= pay;
    if (credit.amount <= EPSILON) ci += 1;
    if (debt.amount <= EPSILON) di += 1;
  }
  return settlements;
}
