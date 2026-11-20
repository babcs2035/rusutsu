/** 管理画面の操作後の読込を，編集用 Server Actions の待ち行列から分離する． */
import type * as Queries from "@/server/edit-requests/editorQueries";
import { withBasePath } from "@/shared/utils/basePath";

/** 短い読込条件だけを送信し，認証とアクセス判断は API へ委ねる． */
async function query<Result>(input: object): Promise<Result> {
  const response = await fetch(withBasePath("/api/admin/editor/queries"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error("編集者または管理者権限が必要です．");
    throw new Error("編集用データを読み込めませんでした．");
  }
  return response.json();
}

/** リフトの形状と保存前の版を取得する． */
export function loadLiftSourceData(
  ...[resortId]: Parameters<typeof Queries.loadLiftSourceData>
): ReturnType<typeof Queries.loadLiftSourceData> {
  return query({ operation: "lift", resortId });
}

/** 編集画面に表示する施設のリンクを取得する． */
export function loadResortLinks(
  ...[resortId]: Parameters<typeof Queries.loadResortLinks>
): ReturnType<typeof Queries.loadResortLinks> {
  return query({ operation: "links", resortId });
}

/** 指定した出どころのコースと保存前の版を取得する． */
export function loadSlopeSourceData(
  ...[resortId, sourceKind]: Parameters<typeof Queries.loadSlopeSourceData>
): ReturnType<typeof Queries.loadSlopeSourceData> {
  return query({ operation: "slope", resortId, sourceKind });
}

/** 施設のレビューを編集用に取得する． */
export function loadReviewForEdit(
  ...[resortId]: Parameters<typeof Queries.loadReviewForEdit>
): ReturnType<typeof Queries.loadReviewForEdit> {
  return query({ operation: "review", resortId });
}

/** シーズンの料金と保存前の版を取得する． */
export function loadTicketForEdit(
  ...[resortId, seasonId]: Parameters<typeof Queries.loadTicketForEdit>
): ReturnType<typeof Queries.loadTicketForEdit> {
  return query({ operation: "ticket", resortId, seasonId });
}

/** 営業状況名と地図の名称を照合する編集データを取得する． */
export function loadLatestStatusMapping(
  ...[resortId, kind, geojsonNames]: Parameters<
    typeof Queries.loadLatestStatusMapping
  >
): ReturnType<typeof Queries.loadLatestStatusMapping> {
  return query({ operation: "mapping", resortId, kind, geojsonNames });
}
