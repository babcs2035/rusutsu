// Auth.js v5 の共有設定（Prisma アダプター付き）
// ミドルウェアとサーバーコンポーネントで共有されます

import type { AuthConfig } from "@auth/core";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { cookies } from "next/headers";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
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
    error: "/login",
  },
  events: {
    async signOut() {
      const jar = await cookies();
      const options = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.AUTH_URL?.startsWith("https://") ?? false,
        path: "/rusutsu",
        maxAge: 0,
      };
      jar.set("rusutsu-login-history", "", options);
      jar.set("rusutsu-favorite-intent", "", options);
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Bind an automatic favorite addition to this successful sign-in only.
        try {
          const jar = await cookies();
          jar.set("rusutsu-login-history", "1", {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.AUTH_URL?.startsWith("https://") ?? false,
            path: "/rusutsu",
            maxAge: 365 * 24 * 60 * 60,
          });
          const intent = JSON.parse(
            jar.get("rusutsu-favorite-intent")?.value ?? "null",
          );
          if (typeof intent?.nonce === "string")
            token.favoriteLoginNonce = intent.nonce;
        } catch {
          /* Admin login and expired intents need no public operation. */
        }
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
      if (typeof token.favoriteLoginNonce === "string")
        (
          session as typeof session & { favoriteLoginNonce?: string }
        ).favoriteLoginNonce = token.favoriteLoginNonce;
      return session;
    },
    // Override redirect to include Next.js basePath (/rusutsu).
    // baseUrl is origin-only (from AUTH_URL or request origin).
    // When url is an OAuth callback URL (e.g. /rusutsu/api/auth/callback/...),
    // returning it as-is causes an infinite redirect loop. Detect and return
    // the post-signin destination instead.
    redirect({ url, baseUrl }) {
      const base = new URL(baseUrl).origin;
      const candidate = new URL(url, base);
      if (candidate.origin !== base) return `${base}/rusutsu/`;
      if (
        candidate.pathname === "/rusutsu" ||
        candidate.pathname.startsWith("/rusutsu/")
      )
        return candidate.href;
      if (candidate.pathname.startsWith("/api/auth")) return `${base}/rusutsu/`;
      candidate.pathname = `/rusutsu${candidate.pathname}`;
      return candidate.href;
    },
  },
  secret: process.env.AUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};
