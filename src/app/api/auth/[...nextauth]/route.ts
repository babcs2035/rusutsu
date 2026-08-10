// NextAuth API route handlers
import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

const NEXTJS_BASE_PATH = "/rusutsu";

function patchUrl(req: NextRequest): NextRequest {
  const url = new URL(req.url);
  const pathname = url.pathname.startsWith(NEXTJS_BASE_PATH)
    ? url.pathname
    : `${NEXTJS_BASE_PATH}${url.pathname}`;
  const patchedUrl = `${url.origin}${pathname}${url.search}`;
  return new (req.constructor as typeof NextRequest)(patchedUrl, req);
}

export const GET = (req: NextRequest) => handlers.GET(patchUrl(req));
export const POST = (req: NextRequest) => handlers.POST(patchUrl(req));
