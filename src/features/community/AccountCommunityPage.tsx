// 単独のアカウントページで，サーバー取得済みの初期データと閉じる操作をつなぐ．
"use client";

import { useRouter } from "next/navigation";
import { AccountCommunityDialog } from "./AccountCommunityDialog";

/** ホームのダイアログと同じ操作を使い，閉じると公開地図に戻る． */
export function AccountCommunityPage(
  props: Omit<Parameters<typeof AccountCommunityDialog>[0], "onClose">,
): React.ReactElement {
  const router = useRouter();
  return <AccountCommunityDialog {...props} onClose={() => router.push("/")} />;
}
