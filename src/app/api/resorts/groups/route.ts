// 利用者が同時表示を選択した施設の組のデータを取得する．
import { respondToPublicQuery } from "@/server/publicQueryHttp";
import { getSimultaneousView } from "@/server/ski-resorts/queries";
import { resortGroupQuerySchema } from "@/server/ski-resorts/queryContract";

/** 選択された組の所属を service で確認し，詳細と地図を返す． */
export function POST(request: Request): Promise<Response> {
  return respondToPublicQuery(
    request,
    resortGroupQuerySchema,
    ({ resortId, groupId }) => getSimultaneousView(resortId, groupId),
  );
}
