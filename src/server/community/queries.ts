/** 投稿・本人情報の取得を RSC と HTTP 入口で共有する． */
import "server-only";
import type { FeedInput, MapEntriesInput } from "@/features/community/contract";
import { executeCommunityOperation as execute } from "@/server/community/dispatch";
import * as direct from "@/server/community/operations";

/** session と既存の公開範囲に従って取得する． */
export async function getCommunityFeed(input: FeedInput) {
  return execute({ operation: "feed", input }, () =>
    direct.getCommunityFeed(input),
  );
}
/** session と既存の公開範囲に従って取得する． */
export async function getCommunityMapEntries(input: MapEntriesInput) {
  return execute({ operation: "mapEntries", input }, () =>
    direct.getCommunityMapEntries(input),
  );
}
/** session と既存の公開範囲に従って取得する． */
export async function getCommunityMapSummary(resortId: string) {
  return execute({ operation: "mapSummary", resortId }, () =>
    direct.getCommunityMapSummary(resortId),
  );
}
/** session と既存の公開範囲に従って取得する． */
export async function getCommunityAccount() {
  return execute({ operation: "account" }, direct.getCommunityAccount);
}
/** session と既存の公開範囲に従って取得する． */
export async function getPostDetail(postId: string) {
  return execute({ operation: "detail", postId }, () =>
    direct.getPostDetail(postId),
  );
}
/** session と既存の公開範囲に従って取得する． */
export async function getComposerSetup(postId?: string) {
  const [account, detail] = await Promise.all([
    getCommunityAccount(),
    postId ? getPostDetail(postId) : null,
  ]);
  return { account, detail };
}
/** session と既存の公開範囲に従って取得する． */
export async function getMyPosts(cursor?: string) {
  return execute({ operation: "myPosts", ...(cursor ? { cursor } : {}) }, () =>
    direct.getMyPosts(cursor),
  );
}
/** session と既存の公開範囲に従って取得する． */
export async function getDayReports(authorId: string, observedOn: string) {
  return execute({ operation: "dayReports", authorId, observedOn }, () =>
    direct.getDayReports(authorId, observedOn),
  );
}
/** session と既存の公開範囲に従って取得する． */
export async function getPublicProfile(userId: string) {
  return execute({ operation: "publicProfile", userId }, () =>
    direct.getPublicProfile(userId),
  );
}
/** session と既存の公開範囲に従って取得する． */
export async function getNotifications() {
  return execute({ operation: "notifications" }, direct.getNotifications);
}
