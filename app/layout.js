import "./globals.css";

export const metadata = {
  title: "전성훈 — 은둔형 연쇄창업가",
  description: "야생에서 뛰어다니고 있는 전성훈을 만나셨나요?",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
