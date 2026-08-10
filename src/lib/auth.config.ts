// Auth.js v5 の共有設定（Prisma アダプター付き）
// ミドルウェアとサーバーコンポーネントで共有されます

import type { AuthConfig } from "@auth/core";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

function isAdmin(email: string): boolean {
  const admins = process.env.ADMIN_EMAILS ?? "";
  return admins
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export const authConfig: AuthConfig = {
  // Set basePath to /rusutsu/api/auth so parseProviders constructs
  // the correct callbackUrl:
  //   new URL("/rusutsu/api/auth", "http://localhost:3000")
  //   → http://localhost:3000/rusutsu/api/auth
  // The route handler patches the pathname to include /rusutsu so
  // @auth/core can parse the action/providerId from the pathname.
  basePath: "/rusutsu/api/auth",
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/admin/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      // 環境変数 ADMIN_EMAILS に基づいて role を設定（DB に role がなければ常に適用）
      if (token.email) {
        const email = token.email as string;
        token.role = token.role ?? (isAdmin(email) ? "admin" : "viewer");
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as unknown as { role: string }).role =
          (token.role as string) ?? "viewer";
      }
      return session;
    },
    // Override redirect to include Next.js basePath (/rusutsu).
    // AUTH_URL is origin-only, so baseUrl = http://localhost:3000.
    // The callback may be called multiple times during signin —
    // guard against double-prefixing by checking if /rusutsu is already present.
    redirect({ url, baseUrl }) {
      const basePath = "/rusutsu";
      if (url.startsWith("/")) {
        return `${baseUrl}${basePath}${url}`;
      }
      if (url.startsWith(baseUrl)) {
        const withoutBase = url.replace(baseUrl, "");
        // Already has basePath — return as-is (idempotent)
        if (withoutBase.startsWith(basePath)) return url;
        return `${baseUrl}${basePath}${withoutBase}`;
      }
      return `${baseUrl}${basePath}/`;
    },
  },
  secret: process.env.AUTH_SECRET,
};
