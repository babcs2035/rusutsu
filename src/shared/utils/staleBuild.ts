// 配備切替で旧画面の操作が失敗したとき，入力を保持したまま知らせる．
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { toast } from "sonner";

/**
 * デプロイ前の画面から Server Action を呼ぶと、新しいサーバーに ID が無く失敗する。
 * 下書きの保存に失敗している場合もあるため，利用者が画面を離れる時期を選べるようにする．
 */
export function notifyIfStaleBuild(error: unknown): boolean {
  if (!unstable_isUnrecognizedActionError(error)) return false;
  toast.error(
    "アプリが更新されました。入力や写真を確認してから、ページを開き直してください。",
    {
      id: "stale-build",
    },
  );
  return true;
}
