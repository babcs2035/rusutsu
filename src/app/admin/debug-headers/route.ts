// Cloudflare Tunnel のヘッダ確認用デバッグエンドポイント
// x-forwarded-proto, x-forwarded-host などの値を確認する

import { headers } from "next/headers";

export async function GET() {
  const h = await headers();
  return Response.json({
    host: h.get("host"),
    "x-forwarded-proto": h.get("x-forwarded-proto"),
    "x-forwarded-host": h.get("x-forwarded-host"),
    "x-forwarded-for": h.get("x-forwarded-for"),
    cookie: h.get("cookie"),
  });
}
