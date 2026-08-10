// Auth.js v5 設定（JWT セッション戦略）
// サーバーコンポーネント・Server Actions 用
// 基本設定は lib/auth.config.ts で定義し、ここでインポートして使用します

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
