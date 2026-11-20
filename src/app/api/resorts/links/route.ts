// 詳細・比較のリンク集を施設の組ごとに取得する．
import { respondToPublicQuery } from "@/server/publicQueryHttp";
import { getResortLinkLists } from "@/server/ski-resorts/queries";
import { resortLinksQuerySchema } from "@/server/ski-resorts/queryContract";

/** 統合元の ID を含む施設の組の順でリンクを返す． */
export function POST(request: Request): Promise<Response> {
  return respondToPublicQuery(request, resortLinksQuerySchema, ({ groups }) =>
    getResortLinkLists(groups),
  );
}
