// 比較で表示する施設の地図だけをまとめて取得する．
import { respondToPublicQuery } from "@/server/publicQueryHttp";
import { getResortMapDataForCompare } from "@/server/ski-resorts/queries";
import { resortMapsQuerySchema } from "@/server/ski-resorts/queryContract";

/** 表示の優先順位と入力順を維持した地図を返す． */
export function POST(request: Request): Promise<Response> {
  return respondToPublicQuery(request, resortMapsQuerySchema, ({ ids }) =>
    getResortMapDataForCompare(ids),
  );
}
