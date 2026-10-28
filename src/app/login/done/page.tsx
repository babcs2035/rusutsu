import type { Metadata } from "next";
import { LoginWindowDone } from "@/features/community/LoginWindow";

export const metadata: Metadata = { title: "ログイン", robots: "noindex" };

export default function LoginDonePage() {
  return <LoginWindowDone />;
}
