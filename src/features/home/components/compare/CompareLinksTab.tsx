"use client";

import { Spinner } from "@/components/ui/spinner";
import {
  LinkGroupBody,
  LinkGroups,
  LinkLoadFailedNote,
} from "@/features/resort-links/ResortLinksTab";
import {
  type ResortLinkGroupsEntry,
  useResortLinkGroups,
} from "@/features/resort-links/useResortLinkGroups";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import {
  COMPARE_CAROUSEL_PAGE_CLASS,
  COMPARE_CAROUSEL_TRACK_CLASS,
  CompareCarouselPager,
  useCompareCarousel,
} from "./CompareCarousel";
import { CompareResortNameCell } from "./CompareResortNameCell";
import { linkTableRows } from "./linkTableRows";
import type { Resort } from "./types";

/** 表の列幅（rem）。グループ名の列と、スキー場 1 列の下限・上限 */
const GROUP_LABEL_WIDTH = 5;
const RESORT_COLUMN_MIN_WIDTH = 20;
const RESORT_COLUMN_MAX_WIDTH = 36;

/**
 * 比較の「リンク集」タブ。中身は詳細のリンク集と同じ部品・同じ並び順。
 *
 * スマホはゲレンデと同じ 1 画面 1 スキー場の横スワイプで、カードの中を縦にスクロールする。
 * PC はグループ（基本・ゲレンデ・料金…）を行、スキー場を列にした表にして、
 * 同じ種類のリンクを横に見比べられるようにする。
 */
export const CompareLinksTab = ({
  resorts,
  isSidePanel,
  onSelectResort,
}: {
  resorts: Resort[];
  isSidePanel: boolean;
  onSelectResort?: (id: string) => void;
}) => {
  const entries = useResortLinkGroups(resorts);
  if (entries.length === 0)
    return (
      <p className="py-10 text-center text-sm font-semibold text-gray-500">
        比較するスキー場がありません。
      </p>
    );
  return isSidePanel ? (
    <LinksTable entries={entries} onSelectResort={onSelectResort} />
  ) : (
    <LinksCarousel entries={entries} onSelectResort={onSelectResort} />
  );
};

const LinksCarousel = ({
  entries,
  onSelectResort,
}: {
  entries: ResortLinkGroupsEntry[];
  onSelectResort?: (id: string) => void;
}) => {
  const { activeIndex, scrollRef, handleScroll, scrollToIndex } =
    useCompareCarousel();
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={COMPARE_CAROUSEL_TRACK_CLASS}
      >
        {entries.map(entry => (
          <div key={entry.resort.id} className={COMPARE_CAROUSEL_PAGE_CLASS}>
            <section
              aria-label={`${entry.resort.nameJa}のリンク集`}
              className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              <CompareResortNameCell
                resort={entry.resort}
                onSelectResort={onSelectResort}
                layout="inline"
                className="shrink-0 justify-between border-b border-gray-200 px-3 py-2"
              />
              {/* リンクが増えても、スキー場の名前を残したままカードの中だけを送る */}
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                {entry.isLoading ? (
                  <LoadingSpinner className="h-48 bg-transparent" />
                ) : (
                  <>
                    <LinkGroups groups={entry.groups} />
                    {entry.failed && <LinkLoadFailedNote />}
                  </>
                )}
              </div>
            </section>
          </div>
        ))}
      </div>
      <CompareCarouselPager
        ids={entries.map(entry => entry.resort.id)}
        activeIndex={activeIndex}
        onIndexChange={scrollToIndex}
      />
    </div>
  );
};

const LinksTable = ({
  entries,
  onSelectResort,
}: {
  entries: ResortLinkGroupsEntry[];
  onSelectResort?: (id: string) => void;
}) => {
  const rows = linkTableRows(entries.map(entry => entry.groups));
  const isAllLoading = entries.every(entry => entry.isLoading);
  return (
    // 縦も横もこの枠の中で送る。スキー場名の行とグループ名の列は固定する
    <div className="h-full overflow-auto rounded-xl border border-gray-200 bg-white">
      <table
        className="w-full table-fixed border-separate border-spacing-0"
        style={{
          minWidth: `${GROUP_LABEL_WIDTH + entries.length * RESORT_COLUMN_MIN_WIDTH}rem`,
          maxWidth: `${GROUP_LABEL_WIDTH + entries.length * RESORT_COLUMN_MAX_WIDTH}rem`,
        }}
      >
        <colgroup>
          <col style={{ width: `${GROUP_LABEL_WIDTH}rem` }} />
          {entries.map(entry => (
            <col key={entry.resort.id} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <td className="sticky top-0 left-0 z-30 border-r border-b border-gray-200 bg-white" />
            {entries.map((entry, index) => (
              <th
                key={entry.resort.id}
                scope="col"
                className={cn(
                  "sticky top-0 z-20 border-b border-gray-200 bg-white px-2 py-1.5 text-left align-middle font-normal",
                  index > 0 && "border-l",
                )}
              >
                <CompareResortNameCell
                  resort={entry.resort}
                  onSelectResort={onSelectResort}
                  layout="inline"
                  className="justify-between"
                />
                {/* 数件ずつ読むので、後から届く列は名前の下に読み込み中を出す */}
                {entry.isLoading && !isAllLoading && (
                  <Spinner className="mt-1 size-4 text-gray-400" />
                )}
                {entry.failed && <LinkLoadFailedNote />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isAllLoading ? (
            <tr>
              <td colSpan={entries.length + 1}>
                <LoadingSpinner className="h-48 bg-transparent" />
              </td>
            </tr>
          ) : (
            rows.map(row => (
              <tr key={row.id}>
                <th
                  scope="row"
                  // 横に送ったとき、下をくぐるリンクとの境目が分かるよう右に線を引く
                  className="sticky left-0 z-10 border-r border-b border-gray-200 bg-slate-50 px-2 py-2.5 text-left align-top text-sm font-semibold text-slate-900"
                >
                  {row.label}
                </th>
                {row.cells.map((group, index) => (
                  <td
                    key={entries[index].resort.id}
                    className={cn(
                      "border-b border-gray-200 p-2 align-top",
                      index > 0 && "border-l",
                    )}
                  >
                    {group && <LinkGroupBody group={group} />}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
