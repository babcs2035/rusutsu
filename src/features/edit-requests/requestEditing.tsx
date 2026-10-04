"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext } from "react";
import { saveRequestCandidate } from "./actions";

/** 通常の編集画面で、確認待ちの申請を開いて直すときに渡す情報。 */
export type RequestEditContext = {
  id: string;
  version: number;
  comment: string;
  resortId: string;
  authorName: string;
  /** 管理者の修正案があればそれを、なければ申請者の提出内容 */
  payload: unknown;
};

export type RequestItemChange = {
  status: "added" | "changed";
  /** 項目名 → 公開中の値（表示用）。変更された項目だけ持つ */
  before: Record<string, string>;
  geometryChanged: boolean;
};

export type RequestChanges = {
  items: Map<string, RequestItemChange>;
  removedNames: string[];
};

export type RequestChangeFields<T> = Record<string, (item: T) => string>;

/** 公開中のデータと比べて、追加・変更・削除された線を求める。 */
export function computeRequestChanges<T>(
  items: T[],
  published: T[],
  {
    id,
    name,
    fields,
    geometry,
  }: {
    id: (item: T) => string;
    name: (item: T) => string;
    fields: RequestChangeFields<T>;
    geometry: (item: T) => unknown;
  },
): RequestChanges {
  const publishedById = new Map(published.map(item => [id(item), item]));
  const currentIds = new Set(items.map(id));
  const changes = new Map<string, RequestItemChange>();
  for (const item of items) {
    const previous = publishedById.get(id(item));
    if (!previous) {
      changes.set(id(item), {
        status: "added",
        before: {},
        geometryChanged: true,
      });
      continue;
    }
    const before: Record<string, string> = {};
    for (const [key, read] of Object.entries(fields)) {
      if (read(item) !== read(previous)) before[key] = read(previous);
    }
    const geometryChanged =
      JSON.stringify(geometry(item)) !== JSON.stringify(geometry(previous));
    if (geometryChanged || Object.keys(before).length > 0)
      changes.set(id(item), { status: "changed", before, geometryChanged });
  }
  return {
    items: changes,
    removedNames: published
      .filter(item => !currentIds.has(id(item)))
      .map(item => name(item) || "名称未設定"),
  };
}

const RequestChangesContext = createContext<RequestChanges | null>(null);
export const RequestChangesProvider = RequestChangesContext.Provider;

/** 一覧の名前の横に出す「変更」「追加」の印。申請の編集中だけ表示する。 */
export function RequestChangeBadge({ id }: { id: string }) {
  const change = useContext(RequestChangesContext)?.items.get(id);
  if (!change) return null;
  return (
    <span
      className={`shrink-0 rounded px-1 py-px text-[10px] font-semibold ${change.status === "added" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}
    >
      {change.status === "added" ? "追加" : "変更"}
    </span>
  );
}

/** 入力欄の上に、公開中の値と違うことを示す。 */
export function RequestFieldChange({
  id,
  field,
}: {
  id: string;
  field: string;
}) {
  const change = useContext(RequestChangesContext)?.items.get(id);
  if (!change || !(field in change.before)) return null;
  return (
    <p className="my-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900 ring-1 ring-amber-200">
      変更あり · 公開中: {change.before[field] || "未設定"}
    </p>
  );
}

export function RequestEditBanner({
  request,
  changes,
}: {
  request: RequestEditContext;
  changes: RequestChanges;
}) {
  const values = [...changes.items.values()];
  const added = values.filter(item => item.status === "added").length;
  return (
    <div className="shrink-0 space-y-1 border-b border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{request.authorName}さんの申請を編集中</p>
        <Link
          href={`/admin/requests/${encodeURIComponent(request.id)}`}
          className="inline-flex shrink-0 items-center gap-1 underline underline-offset-2"
        >
          <ArrowLeft className="size-3" />
          保存せず確認画面へ
        </Link>
      </div>
      <p>
        公開中のデータとの違い: 変更 {values.length - added}件・追加 {added}
        件・削除 {changes.removedNames.length}件 （一覧と地図で
        <span className="mx-0.5 rounded bg-amber-100 px-1 text-amber-900">
          変更
        </span>
        の印を付けています）
      </p>
      {changes.removedNames.length > 0 && (
        <p className="text-blue-900">
          削除: {changes.removedNames.slice(0, 8).join("、")}
          {changes.removedNames.length > 8 && " ほか"}
        </p>
      )}
      <p className="text-blue-800">
        最後に保存すると、この申請の修正案が更新されます。データへの反映は確認画面で承認したときです。
      </p>
    </div>
  );
}

/** 修正案として申請に保存し、確認画面へ戻る。失敗時はエラー文を返す。 */
export function useRequestCandidateSave(request: RequestEditContext | null) {
  const router = useRouter();
  return useCallback(
    async (payload: unknown): Promise<string | null> => {
      if (!request) return "申請が選ばれていません。";
      const result = await saveRequestCandidate(
        request.id,
        request.version,
        payload,
        request.comment,
      );
      if (!result.ok) return result.error;
      router.push(`/admin/requests/${encodeURIComponent(request.id)}`);
      router.refresh();
      return null;
    },
    [request, router],
  );
}
