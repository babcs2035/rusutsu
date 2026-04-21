import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#003366",
};

export const metadata: Metadata = {
  title: {
    default: "Rusutsu",
    template: "%s | Rusutsu",
  },
  icons: {
    icon: "/rusutsu/favicon.ico",
    apple: "/rusutsu/favicon.png",
  },
  manifest: "/rusutsu/manifest.json",
  description:
    "Rusutsu (ルスツ) は，日本全国のスキー場情報を多元的なソースから集約・統合し，可視化するプラットフォームです．リフト稼働状況，詳細な気象予測，積雪履歴など，スキー場の「今」と「これから」を正確に把握できます．",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Rusutsu",
  },
  formatDetection: {
    telephone: false,
  },
  keywords: [
    "スキー",
    "スノーボード",
    "積雪情報",
    "天気予報",
    "スキー場",
    "日本のスキー場",
  ],
  openGraph: {
    title: "Rusutsu | 全国のスキー場情報・積雪予報・コース詳細を一元化",
    description:
      "日本全国のスキー場情報を多元的なソースから集約・統合し，可視化するプラットフォーム．積雪・天気・コース情報を一目で見やすく．",
    url: "https://ktak.dev/rusutsu",
    siteName: "Rusutsu",
    images: [
      {
        url: "/rusutsu/ogp.webp",
        width: 1200,
        height: 630,
        alt: "Rusutsu OGP Image",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rusutsu | 全国のスキー場情報・積雪予報・コース詳細を一元化",
    description:
      "日本全国のスキー場情報を一元化．積雪・天気・コース情報をリアルタイムに把握．",
    images: ["/rusutsu/ogp.webp"],
  },
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
