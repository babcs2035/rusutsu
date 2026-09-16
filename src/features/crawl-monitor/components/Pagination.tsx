import Link from "next/link";
import { buildQueryString } from "../utils/query";

/**
 * 件数が増えてもDOMを増やさないための最小構成のページ送り。
 * 絞り込みはURLに載っているので、ページ番号だけ差し替える。
 */
export function Pagination({
  basePath,
  query,
  page,
  pageCount,
  total,
}: {
  basePath: string;
  query: Record<string, string | number | boolean | null | undefined>;
  page: number;
  pageCount: number;
  total: number;
}) {
  const linkClass =
    "rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50";
  const disabledClass =
    "rounded-md border border-gray-200 bg-gray-100 px-3 py-1 text-sm text-gray-400";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <p className="text-sm text-gray-600">
        全{total}件 / {page}・{pageCount}ページ
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={`${basePath}${buildQueryString(query, { page: page - 1 })}`}
            className={linkClass}
          >
            前へ
          </Link>
        ) : (
          <span className={disabledClass}>前へ</span>
        )}
        {page < pageCount ? (
          <Link
            href={`${basePath}${buildQueryString(query, { page: page + 1 })}`}
            className={linkClass}
          >
            次へ
          </Link>
        ) : (
          <span className={disabledClass}>次へ</span>
        )}
      </div>
    </div>
  );
}
