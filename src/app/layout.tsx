import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import { ChakraProvider } from "@/providers/ChakraProvider";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Rusutsu - スキー場情報可視化",
  description: "日本全国のスキー場情報を可視化・比較",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${bricolage.variable} ${manrope.variable}`}
    >
      <body
        className={manrope.className}
        style={{
          backgroundColor: "var(--bg-light)",
          color: "var(--text-primary)",
        }}
      >
        <ChakraProvider>{children}</ChakraProvider>
        <GoogleAnalytics gaId="G-YMEM5C2F4C" />
      </body>
    </html>
  );
}
