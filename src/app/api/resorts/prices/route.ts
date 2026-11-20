// 一覧・比較用の料金を共通のサーバー計算で返す．
import { respondToPublicQuery } from "@/server/publicQueryHttp";
import { calculateLiftTicketAndRentalForList } from "@/server/ski-resorts/queries";
import { resortPriceQuerySchema } from "@/server/ski-resorts/queryContract";

/** 人数・日程・レンタル条件を検査してから計算する． */
export function POST(request: Request): Promise<Response> {
  return respondToPublicQuery(
    request,
    resortPriceQuerySchema,
    ({ resortIds, input }) =>
      calculateLiftTicketAndRentalForList(resortIds, input),
  );
}
