/** 投稿画面の動的な読込だけを HTTP で取得し，mutation は Server Actions に委ねる． */
import type * as Queries from "@/server/community/queries";
import { withBasePath } from "@/shared/utils/basePath";

/** Cookie による本人判定をサーバーへ委ね，端末や共有 cache へ本人情報を残さない． */
async function query<Result>(command: object): Promise<Result> {
  const response = await fetch(withBasePath("/api/community/queries"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("投稿情報を取得できませんでした．");
  return response.json();
}

/** 条件と本人の閲覧範囲に合う投稿を取得する． */
export function getCommunityFeed(
  ...[input]: Parameters<typeof Queries.getCommunityFeed>
): ReturnType<typeof Queries.getCommunityFeed> {
  return query({ operation: "feed", input });
}
/** 本人の表示名と投稿可能状態を取得する． */
export function getCommunityAccount(): ReturnType<
  typeof Queries.getCommunityAccount
> {
  return query({ operation: "account" });
}
/** 投稿の準備に要る本人情報と編集対象を並列取得する． */
export function getComposerSetup(
  ...[postId]: Parameters<typeof Queries.getComposerSetup>
): ReturnType<typeof Queries.getComposerSetup> {
  return query({ operation: "composer", postId });
}
/** 自分の非表示投稿も含む一覧を取得する． */
export function getMyPosts(
  ...[cursor]: Parameters<typeof Queries.getMyPosts>
): ReturnType<typeof Queries.getMyPosts> {
  return query({ operation: "myPosts", cursor });
}
/** 公開範囲と所有者に応じた投稿を取得する． */
export function getPostDetail(
  ...[postId]: Parameters<typeof Queries.getPostDetail>
): ReturnType<typeof Queries.getPostDetail> {
  return query({ operation: "detail", postId });
}
/** 公開名と公開投稿だけを取得する． */
export function getPublicProfile(
  ...[userId]: Parameters<typeof Queries.getPublicProfile>
): ReturnType<typeof Queries.getPublicProfile> {
  return query({ operation: "publicProfile", userId });
}
/** 本人の通知だけを取得する． */
export function getNotifications(): ReturnType<
  typeof Queries.getNotifications
> {
  return query({ operation: "notifications" });
}

/** 指定した公開プロフィールの滑走日レポートを取得する． */
export function getDayReports(
  ...[authorId, observedOn]: Parameters<typeof Queries.getDayReports>
): ReturnType<typeof Queries.getDayReports> {
  return query({ operation: "dayReports", authorId, observedOn });
}
