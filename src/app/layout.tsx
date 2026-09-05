import type { Metadata } from "next";
import "./globals.css";
import Navigation from "./Navigation";

export const metadata: Metadata = {
  title: "COFFEERIGHT Recruiting Review",
  description: "COFFEERIGHT recruiting evaluation workspace",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <Navigation />
        {children}
      </body>
    </html>
  );
}
