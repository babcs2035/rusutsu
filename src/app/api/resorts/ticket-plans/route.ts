// 詳細・比較の料金計算を正本の公開データで行う．
import { respondToPublicQuery } from "@/server/publicQueryHttp";
import { resortTicketPlansQuerySchema } from "@/server/ski-resorts/queryContract";
import { readResortTicketPlans } from "@/server/ski-resorts/ticketPlans";

/** 操作後の料金条件に対応するプランだけを返す． */
export function POST(request: Request): Promise<Response> {
  return respondToPublicQuery(
    request,
    resortTicketPlansQuerySchema,
    ({ targets, input }) => readResortTicketPlans(targets, input),
  );
}
