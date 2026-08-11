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
  // Cookie config — secure defaults are handled by Auth.js v5.
  // secure: true is set automatically when AUTH_URL uses https://.
  // secure: false is used when AUTH_URL uses http:// (e.g. localhost).
  // Do NOT set cookie name explicitly — Auth.js adds __Secure-/__Host prefix
  // based on the secure flag. Setting a fixed name breaks local development.
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
    },
    callbackUrl: {
      options: {
        sameSite: "lax",
        path: "/",
      },
    },
    csrfToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
    },
    pkceCodeVerifier: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 900,
      },
    },
    state: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 900,
      },
    },
    nonce: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
    },
  },
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

        // 初回サインイン時に ADMIN_EMAILS のメールアドレスなら DB の role を admin に設定
        if (isAdmin(token.email as string)) {
          if (token.role !== "admin") {
            await prisma.user.update({
              where: { id: user.id },
              data: { role: "admin" },
            });
          }
          token.role = "admin";
        }
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
    // baseUrl is origin-only (from AUTH_URL or request origin).
    // When url is an OAuth callback URL (e.g. /rusutsu/api/auth/callback/...),
    // returning it as-is causes an infinite redirect loop. Detect and return
    // the post-signin destination instead.
    redirect({ url, baseUrl }) {
      const basePath = "/rusutsu";

      if (url.startsWith("/")) {
        return `${baseUrl}${basePath}${url}`;
      }

      // url is a full URL — normalize baseUrl (strip trailing slash)
      const base = baseUrl.replace(/\/$/, "");

      if (url.startsWith(base)) {
        const urlObj = new URL(url);
        const callbackUrl = urlObj.searchParams.get("callbackUrl");

        // Use the callbackUrl if present (from OAuth flow or signIn redirect)
        if (callbackUrl) {
          if (callbackUrl.startsWith("/")) {
            return `${base}${basePath}${callbackUrl}`;
          }
          return callbackUrl;
        }

        const withoutBase = url.replace(base, "");
        // url is an auth callback URL without callbackUrl — return home
        if (withoutBase.startsWith("/api/auth")) return `${base}${basePath}/`;
        // Already has basePath — return as-is (idempotent)
        if (withoutBase.startsWith(basePath)) return url;
        return `${base}${basePath}${withoutBase}`;
      }

      return `${base}${basePath}/`;
    },
  },
  secret: process.env.AUTH_SECRET,
  debug: true,
};
