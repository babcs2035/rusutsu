/** 投稿処理の direct/remote 選択と更新後の再検証を一元管理する． */
import "server-only";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/features/community/contract";
import { usesRemoteDataApi } from "@/lib/internalDataApiClient";
import { remoteCommunity } from "@/server/community/remoteClient";
import type {
  CommunityCommand,
  CommunitySuccessPayloads,
} from "@/server/community/remoteContract";

/** 同じ actor と業務契約を使い，取得要求では layout を失効させない． */
export async function executeCommunityOperation<
  K extends keyof CommunitySuccessPayloads,
>(
  command: Extract<CommunityCommand, { operation: K }> & { operation: K },
  local: () => Promise<ActionResult<CommunitySuccessPayloads[K]>>,
  photos?: FormData,
): Promise<ActionResult<CommunitySuccessPayloads[K]>> {
  if (!usesRemoteDataApi()) return local();
  const result = await remoteCommunity<K>(command, photos);
  const operation = (command as { operation: K }).operation;
  if (
    result.ok &&
    ![
      // The composer refreshes its feed/map after saving. A layout refresh
      // refetches all resort data and can unmount the success screen.
      "publish",
      "update",
      "courses",
      "feed",
      "mapEntries",
      "mapSummary",
      "account",
      "detail",
      "publicProfile",
      "notifications",
      "myPosts",
      "dayReports",
      // 押した結果は画面がその場で反映するので、全体を読み直さない
      "react",
    ].includes(operation)
  )
    revalidatePath("/", "layout");
  return result;
}
