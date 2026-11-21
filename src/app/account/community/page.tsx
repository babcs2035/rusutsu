import { AccountCommunityPage } from "@/features/community/AccountCommunityPage";
import {
  getCommunityAccount,
  getNotifications,
} from "@/server/community/queries";

/** 設定と通知の初期値を現在のセッションで読み，画面へ渡す． */
export default async function CommunityAccountPage(): Promise<React.ReactElement> {
  const initialSettings = await Promise.all([
    getCommunityAccount(),
    getNotifications(),
  ]).catch((error: unknown) => {
    console.warn("Could not load the initial community settings", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return undefined;
  });
  return (
    <AccountCommunityPage
      initialView="settings"
      initialSettings={initialSettings}
    />
  );
}
