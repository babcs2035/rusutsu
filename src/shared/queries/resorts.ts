// 操作後に必要な施設データを取得し，取得用 Server Actions の直列待ちを避ける．
import type * as Queries from "@/server/ski-resorts/queries";
import { withBasePath } from "@/shared/utils/basePath";

/** 同一アプリの公開 HTTP query を呼び，失敗を呼び出し元へ返す． */
async function query<Result>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Result> {
  const response = await fetch(withBasePath(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  if (!response.ok)
    throw new Error(
      `施設情報を取得できませんでした（HTTP ${response.status}）．`,
    );
  return response.json();
}

/** 施設一件の詳細を取得する． */
export function getSkiResortById(
  ...[id]: Parameters<typeof Queries.getSkiResortById>
): ReturnType<typeof Queries.getSkiResortById> {
  return query("/api/resorts/details", { ids: [id], single: true });
}

/** 比較の施設詳細をまとめて取得する． */
export function getSkiResortsForCompare(
  ids: Parameters<typeof Queries.getSkiResortsForCompare>[0],
  signal?: AbortSignal,
): ReturnType<typeof Queries.getSkiResortsForCompare> {
  return query("/api/resorts/details", { ids }, signal);
}

/** 比較の地図を表示優先度に合わせて取得する． */
export function getResortMapDataForCompare(
  ids: Parameters<typeof Queries.getResortMapDataForCompare>[0],
  signal?: AbortSignal,
): ReturnType<typeof Queries.getResortMapDataForCompare> {
  return query("/api/resorts/maps", { ids }, signal);
}

/** 一覧・比較と同じ入口でサーバー計算した料金を取得する． */
export function calculateLiftTicketAndRentalForList(
  ...[resortIds, input]: Parameters<
    typeof Queries.calculateLiftTicketAndRentalForList
  >
): ReturnType<typeof Queries.calculateLiftTicketAndRentalForList> {
  return query("/api/resorts/prices", { resortIds, input });
}

/** 施設ごとのリンク一覧を必要になった時点で取得する． */
export function getResortLinkLists(
  ...[groups]: Parameters<typeof Queries.getResortLinkLists>
): ReturnType<typeof Queries.getResortLinkLists> {
  return query("/api/resorts/links", { groups });
}

/** 同時表示する組の詳細と地図を取得する． */
export function getSimultaneousView(
  ...[resortId, groupId]: Parameters<typeof Queries.getSimultaneousView>
): ReturnType<typeof Queries.getSimultaneousView> {
  return query("/api/resorts/groups", { resortId, groupId });
}
