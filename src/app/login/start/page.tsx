import type { Metadata } from "next";
import { LoginWindowStart } from "@/features/community/LoginWindow";

export const metadata: Metadata = { title: "ログイン", robots: "noindex" };

export default function LoginStartPage() {
  return <LoginWindowStart />;
}
