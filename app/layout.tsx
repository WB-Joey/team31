import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "사근사근팀 콘텐츠 플랫폼",
  description: "삼일교회 청년부 사근사근팀 팀모임 콘텐츠 플랫폼",
  openGraph: {
    title: "사근사근팀 콘텐츠 플랫폼",
    description: "오늘의 팀모임, 우리 팀에 딱 맞는 콘텐츠를 찾아보세요!",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "사근사근팀 콘텐츠 플랫폼",
    description: "오늘의 팀모임, 우리 팀에 딱 맞는 콘텐츠를 찾아보세요!",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fb923c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
