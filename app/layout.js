import "./globals.css";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0d1f",
};

export const metadata = {
  metadataBase: new URL("https://sunghoon-nine.vercel.app"),
  title: "전성훈 — 은둔형 연쇄창업가",
  description: "야생에서 뛰어다니고 있는 전성훈을 만나셨나요? 혼자 사업 8개 굴리는 중.",
  openGraph: {
    title: "전성훈 — 은둔형 연쇄창업가",
    description: "어? 야생의 전성훈이 나타났다! 혼자 사업 8개 굴리는 중.",
    url: "https://sunghoon-nine.vercel.app",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
