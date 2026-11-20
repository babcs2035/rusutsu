// 公開詳細の単体・比較用読込を提供する．
import { respondToPublicQuery } from "@/server/publicQueryHttp";
import {
  getSkiResortById,
  getSkiResortsForCompare,
} from "@/server/ski-resorts/queries";
import { resortDetailsQuerySchema } from "@/server/ski-resorts/queryContract";

/** 単体は地図を含め，比較は別要求で地図を遅延取得する． */
export function POST(request: Request): Promise<Response> {
  return respondToPublicQuery(
    request,
    resortDetailsQuerySchema,
    async ({ ids, single }) =>
      single ? getSkiResortById(ids[0]) : getSkiResortsForCompare(ids),
  );
}
