// Proxy 用認証ハンドラー（/admin ルートの保護）
// @auth/core/jwt の getToken を使用し、クッキーから JWT を直接検証します（Prisma に非依存）

import { getToken } from "@auth/core/jwt";
import type { NextRequest } from "next/server";

// 確認するセッション Cookie 名（優先順）
// Auth.js v5 は secure（https）環境で Cookie 名に __Secure- プレフィックスを付与する。
// getToken の既定（secureCookie 未指定）はプレフィックスなし名のみを探すため、
// https のデプロイ環境ではトークンが見つからず常にログインページへリダイレクトされてしまう。
// したがってプレフィックス付き・なしの両名を確認する。
// 注意: salt は本番コードと同様に「完全な Cookie 名」になる必要があり、
// cookieName を明示すると getToken の既定 salt（= cookieName）が自動的に一致する。
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
];

// この Proxy が参照するセッショントークンのフィールド
type SessionToken = {
  id?: string;
  role?: string;
};

export async function proxy(req: NextRequest) {
  // JWT トークンを取得（Prisma なしでクッキーから直接検証）
  let token: SessionToken | null = null;
  for (const cookieName of SESSION_COOKIE_NAMES) {
    token = (await getToken({
      req,
      secret: process.env.AUTH_SECRET,
      cookieName,
    })) as SessionToken | null;
    if (token) break;
  }

  // req.nextUrl.pathname は basePath を含まない（/admin, /admin/login 等形式）
  const isLoginPage = req.nextUrl.pathname === "/admin/login";
  const isLogoutPage = req.nextUrl.pathname === "/admin/logout";
  const isNoAccessPage = req.nextUrl.pathname === "/admin/no-access";
  const isAdminPath =
    req.nextUrl.pathname.startsWith("/admin") &&
    !isLoginPage &&
    !isLogoutPage &&
    !isNoAccessPage;

  // ログイン中のログインページアクセスリダイレクト
  if (isLoginPage && token?.id) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return Response.redirect(url);
  }

  // 管理ページへのアクセスチェック
  if (isAdminPath) {
    if (!token?.id) {
      // 未認証ならログインページへ
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return Response.redirect(url);
    }
    if (token.role !== "admin") {
      // admin 以外なら権限なしページへ
      const url = req.nextUrl.clone();
      url.pathname = "/admin/no-access";
      return Response.redirect(url);
    }
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
