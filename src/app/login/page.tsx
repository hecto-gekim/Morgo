"use client";

import { useRouter } from "next/navigation";
import CharacterImage from "@/components/CharacterImage";
import { useEffect, useState } from "react";
import { useHydrated, useMorgo } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useMorgo((s) => s.user);
  const login = useMorgo((s) => s.login);
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (hydrated && user && !user.isGuest) router.replace("/");
  }, [hydrated, user, router]);

  const skip = () => {
    login({ email: "", nickname: "게스트", isGuest: true });
    router.replace("/");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("올바른 이메일을 입력해 주세요.");
      return;
    }
    if (!nickname.trim()) {
      setError("닉네임을 입력해 주세요.");
      return;
    }
    login({ email, nickname: nickname.trim(), isGuest: false });
    router.replace("/");
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-morgo-cream px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="text-center">
          <h1 className="flex items-center justify-center text-5xl font-extrabold tracking-tight text-morgo-navy">
            Morgo<span className="text-3xl">📍</span>
          </h1>
          <p className="mt-1 text-sm font-semibold text-morgo-navy/60">
            다트를 던지면 정해진 곳으로 그냥 출발
          </p>
          <CharacterImage
            src="/character/hero.png"
            alt="모로고 캐릭터"
            width={230}
            height={320}
            priority
            className="mx-auto mt-4"
          />
        </div>

        <form
          onSubmit={submit}
          className="mt-5 rounded-3xl bg-morgo-card p-5 shadow-lg shadow-morgo-navy/5"
        >
          <label className="block text-sm font-semibold text-morgo-navy/80">
            이메일
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-xl border border-morgo-navy/15 bg-white px-3 py-3 text-base font-normal outline-none focus:border-morgo-yellow"
            />
          </label>
          <label className="mt-4 block text-sm font-semibold text-morgo-navy/80">
            닉네임
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="여행자"
              className="mt-1 w-full rounded-xl border border-morgo-navy/15 bg-white px-3 py-3 text-base font-normal outline-none focus:border-morgo-yellow"
            />
          </label>
          {error && <p className="mt-2 text-sm text-morgo-pink">{error}</p>}
          <button
            type="submit"
            className="mt-5 w-full rounded-xl bg-morgo-navy py-3.5 font-bold text-white active:bg-morgo-navy-deep"
          >
            시작하기
          </button>
          <div className="mt-4 space-y-2">
            {["네이버로 시작하기", "카카오로 시작하기", "구글로 시작하기"].map(
              (label) => (
                <button
                  key={label}
                  type="button"
                  disabled
                  className="w-full rounded-xl border border-morgo-navy/10 py-3 text-sm text-morgo-navy/35"
                >
                  {label} (준비 중)
                </button>
              ),
            )}
          </div>
          <p className="mt-4 text-center text-[11px] text-morgo-navy/40">
            알파 버전 — 이메일 인증 없이 로그인됩니다.
          </p>
        </form>

        <button
          type="button"
          onClick={skip}
          className="mt-3 w-full py-2 text-center text-sm font-semibold text-morgo-navy/50"
        >
          나중에 할게요 · 건너뛰고 둘러보기
        </button>
      </div>
    </div>
  );
}
