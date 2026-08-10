// プロキシ用認証ハンドラー（Node ランタイム対応）
// @auth/core/jwt の getToken を使用し、Prisma に依存しない
// GET リクエストのみに認証チェックを適用。POST（Server Action）は NextResponse.next() で通過させる。

import type { JWT } from "@auth/core/jwt";
import { getToken } from "@auth/core/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  // POST リクエスト（Server Action 等）は認証チェックをスキップ
  if (request.method === "POST") {
    return NextResponse.next();
  }

  // JWT トークンを取得（Prisma なしでクッキーから直接検証）
  let token: JWT | null;
  try {
    token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
    });
  } catch {
    // トークン取得に失敗した場合は未認証として扱う
    token = null;
  }

  // request.nextUrl.pathname は basePath を含まない（/admin, /admin/login 等形式）
  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  const isAdminPath =
    request.nextUrl.pathname.startsWith("/admin") && !isLoginPage;

  // ログイン中のログインページアクセスリダイレクト
  if (isLoginPage && token?.id) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return Response.redirect(url);
  }

  // 管理ページへのアクセスチェック
  if (isAdminPath) {
    if (!token?.id) {
      // 未認証ならログインページへ
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return Response.redirect(url);
    }
    if ((token as { role?: string }).role !== "admin") {
      // admin 以外ならホームへ
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return Response.redirect(url);
    }
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
