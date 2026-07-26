"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/trips", label: "여행", icon: "🧳" },
  { href: "/map", label: "지도", icon: "🗺️" },
  { href: "/missions", label: "미션", icon: "📸" },
  { href: "/me", label: "마이", icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-morgo-yellow bg-morgo-navy pb-[env(safe-area-inset-bottom)] md:top-0 md:bottom-auto md:border-t-0 md:border-b">
      <div className="mx-auto flex max-w-3xl md:max-w-5xl md:justify-between md:px-6 md:items-center">
        <Link
          href="/"
          className="hidden md:flex items-center gap-1 text-xl font-extrabold text-white py-3"
        >
          Morgo<span className="text-morgo-yellow">📍</span>
        </Link>
        <div className="flex flex-1 md:flex-none md:gap-2">
          {TABS.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href) ||
                  (tab.href === "/trips" && pathname.startsWith("/trip/"));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 md:flex-none flex-col md:flex-row items-center gap-0.5 md:gap-1.5 py-2 md:py-3 md:px-3 min-h-[52px] md:min-h-0 justify-center text-[11px] md:text-sm ${
                  active
                    ? "text-morgo-yellow font-bold"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                <span
                  className={`text-lg md:text-base leading-none ${
                    active ? "" : "grayscale opacity-70"
                  }`}
                >
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
