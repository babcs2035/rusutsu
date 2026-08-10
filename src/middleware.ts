// ミドルウェア用認証ハンドラー（Edge ランタイム対応）
// @auth/core/jwt の getToken を使用し、 Prisma に依存しないため Edge で動作します

import { getToken } from "@auth/core/jwt";
import type { NextRequest } from "next/server";

export default async function middleware(req: NextRequest) {
  // JWT トークンを取得（Prisma なしでクッキーから直接検証）
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

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
    if ((token as { role?: string }).role !== "admin") {
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
