"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatWon } from "@/lib/logic";
import { getDeviceId } from "@/lib/device";
import {
  addExpense,
  deleteExpense,
  fetchRoom,
  joinRoom,
} from "@/lib/room-client";
import { computeBalances, computeSettlements } from "@/lib/settle";
import { useMorgo } from "@/lib/store";
import { THEME_LABELS, type Room } from "@/lib/types";

const POLL_MS = 4000;

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const nickname = useMorgo((s) => s.user?.nickname);

  // 브라우저 고정 식별자는 첫 렌더에 바로 확보 (SSR에선 "" → loading 화면이라 불일치 없음)
  const [myId] = useState(() => getDeviceId());
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const roomRef = useRef<Room | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchRoom(code);
      if (!r) {
        setNotFound(true);
      } else {
        roomRef.current = r;
        setRoom(r);
      }
    } catch {
      // 폴링 중 일시 오류는 조용히 무시 (다음 주기에 재시도)
    } finally {
      setLoading(false);
    }
  }, [code]);

  // 최초 로드 + 폴링으로 준실시간 동기화 (setState는 타이머 콜백 안에서 일어난다)
  useEffect(() => {
    const kick = setTimeout(load, 0);
    const t = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [load]);

  // 방 테마를 화면에 반영 (친구도 같은 분위기로)
  useEffect(() => {
    if (!room) return;
    document.documentElement.dataset.theme =
      room.theme === "normal" ? "" : room.theme;
  }, [room]);

  const isMember = !!room && !!myId && room.members.some((m) => m.id === myId);

  if (loading) {
    return <Centered>불러오는 중…</Centered>;
  }
  if (notFound || !room) {
    return (
      <Centered>
        <div className="text-center">
          <div className="text-4xl">🤔</div>
          <p className="mt-2 font-bold">방을 찾을 수 없어요</p>
          <p className="mt-1 text-sm text-morgo-navy/55">
            링크가 만료됐거나 코드가 틀렸어요.
          </p>
        </div>
      </Centered>
    );
  }

  return (
    <div className="min-h-dvh bg-morgo-cream">
      <main className="mx-auto max-w-md px-4 pt-6 pb-16">
        <RoomHeader room={room} />
        {!isMember ? (
          <JoinForm
            defaultName={nickname && nickname !== "게스트" ? nickname : ""}
            onJoin={async (name) => {
              const r = await joinRoom(code, myId, name);
              roomRef.current = r;
              setRoom(r);
            }}
          />
        ) : (
          <RoomBody
            room={room}
            myId={myId}
            onExpenseAdd={async (input) => {
              const r = await addExpense(code, input);
              roomRef.current = r;
              setRoom(r);
            }}
            onExpenseDelete={async (id) => {
              const r = await deleteExpense(code, id);
              roomRef.current = r;
              setRoom(r);
            }}
          />
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-morgo-cream px-6 text-morgo-navy/70">
      {children}
    </div>
  );
}

function RoomHeader({ room }: { room: Room }) {
  return (
    <header className="rounded-2xl bg-morgo-navy p-5 text-white shadow-lg shadow-morgo-navy/20">
      <div className="text-xs text-morgo-yellow">
        {THEME_LABELS[room.theme]} 여행 · 방 코드 {room.code}
      </div>
      <h1 className="mt-1 text-2xl font-extrabold">{room.cityName}</h1>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {room.members.map((m) => (
          <span
            key={m.id}
            className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold"
          >
            {m.name}
          </span>
        ))}
      </div>
    </header>
  );
}

function JoinForm({
  defaultName,
  onJoin,
}: {
  defaultName: string;
  onJoin: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("이름을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onJoin(trimmed);
    } catch {
      setError("참여에 실패했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl bg-morgo-card p-5 shadow-sm">
      <h2 className="font-bold">이름 입력하고 참여하기</h2>
      <p className="mt-1 text-sm text-morgo-navy/55">
        로그인 없이 이름만 정하면 바로 함께할 수 있어요.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="예: 지민"
        maxLength={20}
        className="mt-3 w-full rounded-xl border border-morgo-navy/15 bg-morgo-card px-4 py-3 outline-none focus:border-morgo-navy/40"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 w-full rounded-xl bg-morgo-navy py-3.5 font-bold text-white active:bg-morgo-navy-deep disabled:opacity-60"
      >
        {busy ? "참여 중…" : "참여하기"}
      </button>
      {error && <p className="mt-2 text-sm text-morgo-pink">{error}</p>}
    </section>
  );
}

function RoomBody({
  room,
  myId,
  onExpenseAdd,
  onExpenseDelete,
}: {
  room: Room;
  myId: string;
  onExpenseAdd: (input: {
    payerId: string;
    amount: number;
    label: string;
    missionId?: string;
  }) => Promise<void>;
  onExpenseDelete: (id: string) => Promise<void>;
}) {
  const nameOf = useMemo(() => {
    const map = new Map(room.members.map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? "?";
  }, [room.members]);

  const total = room.expenses.reduce((s, e) => s + e.amount, 0);
  const balances = computeBalances(room.members, room.expenses);
  const settlements = computeSettlements(room.members, room.expenses);
  const myBalance = balances.find((b) => b.memberId === myId);

  return (
    <>
      {/* 공유 미션 (미션별 지출 합계 표시) */}
      {room.missions.length > 0 && (
        <section className="mt-4 rounded-2xl bg-morgo-card p-5 shadow-sm">
          <h2 className="font-bold">함께할 미션</h2>
          <ul className="mt-3 space-y-2">
            {room.missions.map((m) => {
              const spent = room.expenses
                .filter((e) => e.missionId === m.id)
                .reduce((s, e) => s + e.amount, 0);
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl bg-morgo-cream px-3 py-2.5 text-sm"
                >
                  <span className="text-lg">{m.emoji}</span>
                  <span className="flex-1 font-semibold">{m.title}</span>
                  {spent > 0 && (
                    <span className="text-xs font-semibold text-morgo-pink">
                      {formatWon(spent)}
                    </span>
                  )}
                  <span className="text-xs text-morgo-navy/55">{m.points}P</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 정산 */}
      <section className="mt-4 rounded-2xl bg-morgo-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">돈 정산</h2>
          <span className="text-sm text-morgo-navy/55">
            총 {formatWon(total)}
          </span>
        </div>

        {myBalance && (
          <p className="mt-2 text-sm">
            나({nameOf(myId)}) ·{" "}
            {myBalance.net > 0 ? (
              <span className="font-bold text-morgo-mint">
                {formatWon(myBalance.net)} 받을 돈
              </span>
            ) : myBalance.net < 0 ? (
              <span className="font-bold text-morgo-pink">
                {formatWon(-myBalance.net)} 낼 돈
              </span>
            ) : (
              <span className="font-bold">정산 완료</span>
            )}
          </p>
        )}

        {settlements.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {settlements.map((s, i) => (
              <li
                key={`${s.fromId}-${s.toId}-${i}`}
                className="flex items-center gap-2 rounded-xl bg-morgo-cream px-3 py-2.5 text-sm"
              >
                <span className="font-semibold">{nameOf(s.fromId)}</span>
                <span className="text-morgo-navy/40">→</span>
                <span className="font-semibold">{nameOf(s.toId)}</span>
                <span className="ml-auto font-bold text-morgo-pink">
                  {formatWon(s.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-morgo-navy/55">
            아직 정산할 내역이 없어요. 지출을 추가해보세요.
          </p>
        )}
      </section>

      {/* 지출 추가 + 내역 */}
      <ExpenseSection
        room={room}
        myId={myId}
        nameOf={nameOf}
        onExpenseAdd={onExpenseAdd}
        onExpenseDelete={onExpenseDelete}
      />
    </>
  );
}

function ExpenseSection({
  room,
  myId,
  nameOf,
  onExpenseAdd,
  onExpenseDelete,
}: {
  room: Room;
  myId: string;
  nameOf: (id: string) => string;
  onExpenseAdd: (input: {
    payerId: string;
    amount: number;
    label: string;
    missionId?: string;
  }) => Promise<void>;
  onExpenseDelete: (id: string) => Promise<void>;
}) {
  const [payerId, setPayerId] = useState(myId);
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [missionId, setMissionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missionOf = useMemo(() => {
    const map = new Map(room.missions.map((m) => [m.id, m]));
    return (id?: string) => (id ? map.get(id) : undefined);
  }, [room.missions]);

  const submit = async () => {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) {
      setError("금액을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onExpenseAdd({
        payerId,
        amount: amt,
        label: label.trim() || "지출",
        missionId: missionId || undefined,
      });
      setAmount("");
      setLabel("");
      setMissionId("");
    } catch {
      setError("추가에 실패했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl bg-morgo-card p-5 shadow-sm">
      <h2 className="font-bold">지출 추가</h2>
      <div className="mt-3 space-y-2">
        <select
          value={payerId}
          onChange={(e) => setPayerId(e.target.value)}
          className="w-full rounded-xl border border-morgo-navy/15 bg-morgo-card px-4 py-3 outline-none focus:border-morgo-navy/40"
        >
          {room.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.id === myId ? " (나)" : ""} 결제
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="금액(원)"
            className="w-32 rounded-xl border border-morgo-navy/15 bg-morgo-card px-4 py-3 outline-none focus:border-morgo-navy/40"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="어디에 썼나요? (예: 점심)"
            maxLength={40}
            className="min-w-0 flex-1 rounded-xl border border-morgo-navy/15 bg-morgo-card px-4 py-3 outline-none focus:border-morgo-navy/40"
          />
        </div>
        {room.missions.length > 0 && (
          <select
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            className="w-full rounded-xl border border-morgo-navy/15 bg-morgo-card px-4 py-3 outline-none focus:border-morgo-navy/40"
          >
            <option value="">미션 연결 안 함</option>
            {room.missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.emoji} {m.title}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full rounded-xl bg-morgo-navy py-3 font-bold text-white active:bg-morgo-navy-deep disabled:opacity-60"
        >
          {busy ? "추가 중…" : "지출 추가"}
        </button>
        {error && <p className="text-sm text-morgo-pink">{error}</p>}
      </div>

      {room.expenses.length > 0 && (
        <ul className="mt-4 space-y-2">
          {room.expenses.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-xl bg-morgo-cream px-3 py-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{e.label}</div>
                <div className="text-xs text-morgo-navy/55">
                  {nameOf(e.payerId)} 결제
                  {(() => {
                    const m = missionOf(e.missionId);
                    return m ? ` · ${m.emoji} ${m.title}` : "";
                  })()}
                </div>
              </div>
              <span className="font-bold">{formatWon(e.amount)}</span>
              <button
                type="button"
                onClick={() => onExpenseDelete(e.id)}
                aria-label="삭제"
                className="grid h-7 w-7 place-items-center rounded-full bg-morgo-navy/10 text-morgo-navy/60"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
