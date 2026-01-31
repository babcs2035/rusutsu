import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ChakraProvider } from "@/providers/ChakraProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="ja" suppressHydrationWarning>
      <body className={inter.className}>
        <ChakraProvider>{children}</ChakraProvider>
        <GoogleAnalytics gaId="G-YMEM5C2F4C" />
      </body>
    </html>
  );
}
