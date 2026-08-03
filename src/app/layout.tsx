import type { Metadata, Viewport } from "next";
import "./globals.css";
import GhostEasterEgg from "@/components/GhostEasterEgg";

export const metadata: Metadata = {
  title: "Morgo — 핀 던지면 그냥 가는 거임",
  description:
    "다트를 던지면 목적지가 정해지고, 룰렛이 정한 미션을 그대로 수행하는 랜덤 여행 웹앱",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <GhostEasterEgg />
      </body>
    </html>
  );
}
