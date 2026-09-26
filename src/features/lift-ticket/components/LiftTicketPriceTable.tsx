"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LiftTicketData } from "../types";
import { sharedResortsOf } from "../types";
import type { PriceEntry, PriceRow, PriceTable } from "../utils/priceTable";
import { buildLiftTicketPriceTables } from "../utils/priceTable";
import { SourceLinks } from "./SourceLinks";

/** 単独券（このスキー場だけ）か共通券（他のスキー場でも使える）か */
type TableMode = "single" | "shared";

/**
 * 1つの金額。Web・前売で安くなる料金は青字にし、窓口の金額を下に小さく添える
 * （目印のバッジを横に付けると列が広がり、スマホで横スクロールが増える）
 */
const PriceValue = ({ entry }: { entry: PriceEntry | undefined }) => {
  if (!entry) return <span className="text-gray-400">—</span>;
  if (entry.amount == null) {
    return <span className="text-gray-600 text-xs">{entry.text}</span>;
  }
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span
        className={cn(
          "font-bold tabular-nums",
          entry.purchaseTag ? "text-blue-700" : "text-gray-900",
        )}
      >
        {entry.amount === 0 ? "無料" : entry.amount.toLocaleString("ja-JP")}
      </span>
      {entry.counterAmount != null && (
        <span className="text-gray-500 text-[0.625rem] tabular-nums">
          窓口{entry.counterAmount.toLocaleString("ja-JP")}
        </span>
      )}
    </span>
  );
};

/**
 * 表の小行。日付で料金が変わる券は日付区分ごとに1行にする
 * （セルに「平日：6,300円 / 土日：6,800円」を並べると横に長くなり、スマホで読めない）。
 * 日付で変わらない区分（めがひらの子供料金など）は小行をまたいで1セルにする。
 */
type SubRow = { key: string; label: string | null; period: string | null };

const subRowsOf = (row: PriceRow): SubRow[] => {
  const seen = new Map<string, SubRow>();
  for (const cell of row.cells.values()) {
    for (const entry of cell.entries) {
      if (entry.calendarLabel == null || seen.has(entry.calendarLabel)) {
        continue;
      }
      seen.set(entry.calendarLabel, {
        key: entry.calendarLabel,
        label: entry.calendarLabel,
        period: entry.calendarPeriod,
      });
    }
  }
  return seen.size > 0
    ? [...seen.values()]
    : [{ key: "all", label: null, period: null }];
};

const STICKY_CELL =
  "sticky left-0 z-10 min-w-[5.5rem] max-w-[8rem] bg-white px-2 py-2 text-left align-middle md:max-w-none md:px-3";
const PRICE_CELL =
  "px-1.5 py-2 text-right align-middle whitespace-nowrap text-sm md:px-3";

const RowLabel = ({ row }: { row: PriceRow }) => (
  <>
    <span className="block text-gray-900 text-sm font-semibold leading-snug">
      {row.label}
    </span>
    {[row.subLabel, ...row.conditions, ...row.notes]
      .filter(Boolean)
      .map(text => (
        <span
          key={text}
          className="block text-gray-500 text-[0.6875rem] leading-snug"
        >
          {text}
        </span>
      ))}
  </>
);

const TableRows = ({
  row,
  audiences,
}: {
  row: PriceRow;
  audiences: PriceTable["audiences"];
}) => {
  const subRows = subRowsOf(row);
  const hasSubRows = subRows[0].label != null;
  const cellOf = (audienceId: string) => row.cells.get(audienceId);
  const entryFor = (audienceId: string, subRow: SubRow) =>
    cellOf(audienceId)?.entries.find(
      entry => entry.calendarLabel === subRow.label,
    );
  // 日付で変わらない区分（日付ラベルの無い金額）は小行をまたぐ
  const spansSubRows = (audienceId: string) =>
    hasSubRows &&
    (cellOf(audienceId)?.entries.every(entry => entry.calendarLabel == null) ??
      false);

  return (
    <>
      {hasSubRows && (
        <tr className="border-t border-gray-200">
          <th
            scope="rowgroup"
            colSpan={audiences.length + 1}
            className="sticky left-0 bg-white px-2.5 pt-2 pb-0.5 text-left font-normal md:px-3"
          >
            <RowLabel row={row} />
          </th>
        </tr>
      )}
      {subRows.map((subRow, subIndex) => (
        <tr
          key={subRow.key}
          className={cn(!hasSubRows && "border-t border-gray-200")}
        >
          <th scope="row" className={cn(STICKY_CELL, "font-normal")}>
            {hasSubRows ? (
              <span className="block pl-2 text-gray-700 text-xs leading-snug">
                {subRow.label}
                {subRow.period && (
                  <span className="block text-gray-500 text-[0.625rem]">
                    {subRow.period}
                  </span>
                )}
              </span>
            ) : (
              <RowLabel row={row} />
            )}
          </th>
          {row.spansAllAudiences ? (
            <td
              colSpan={audiences.length}
              className={cn(PRICE_CELL, "text-center")}
            >
              <PriceValue entry={entryFor(audiences[0].id, subRow)} />
            </td>
          ) : (
            audiences.map(audience => {
              if (spansSubRows(audience.id)) {
                if (subIndex > 0) return null;
                return (
                  <td
                    key={audience.id}
                    rowSpan={subRows.length}
                    className={PRICE_CELL}
                  >
                    <PriceValue entry={cellOf(audience.id)?.entries[0]} />
                  </td>
                );
              }
              return (
                <td key={audience.id} className={PRICE_CELL}>
                  <PriceValue entry={entryFor(audience.id, subRow)} />
                </td>
              );
            })
          )}
        </tr>
      ))}
    </>
  );
};

const PriceGrid = ({ table }: { table: PriceTable }) => (
  <Card className="w-full overflow-hidden py-0">
    <CardContent className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-gray-50 px-2.5 py-2 text-left text-gray-600 text-xs font-semibold md:px-3"
              >
                券種
              </th>
              {table.audiences.map(audience => (
                <th
                  key={audience.id}
                  scope="col"
                  className="px-1.5 py-2 text-right align-bottom text-gray-700 text-xs font-semibold whitespace-nowrap md:px-3"
                >
                  {audience.label}
                  {audience.ageLabel && (
                    <span className="block text-gray-500 text-[0.625rem] font-normal">
                      {audience.ageLabel}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map(row => (
              <TableRows key={row.key} row={row} audiences={table.audiences} />
            ))}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
);

/** 表の金額が拠っている出典（重複を除く） */
const tableSourcesOf = (table: PriceTable) =>
  [
    ...new Set(
      table.rows.flatMap(row =>
        [...row.cells.values()].flatMap(cell =>
          cell.entries.flatMap(entry => entry.sourceNumbers),
        ),
      ),
    ),
  ].sort((left, right) => left - right);

export const LiftTicketPriceTable = ({ data }: { data: LiftTicketData }) => {
  const [mode, setMode] = useState<TableMode>("single");
  const sharedPartners = useMemo(
    () => sharedResortsOf(data.products),
    [data.products],
  );
  const tables = useMemo(
    () => buildLiftTicketPriceTables(data, { scope: mode }),
    [data, mode],
  );

  const modes: Array<[TableMode, string]> = [
    ["single", "このスキー場のみ"],
    [
      "shared",
      sharedPartners.length > 0
        ? `共通券（${sharedPartners.map(partner => partner.nameJa).join("・")}）`
        : "共通券",
    ],
  ];

  // 通常料金と条件付き料金を分ける。同じ表に並べると
  // 「誰でもその値段で買える」と誤読される
  const sections = [
    { key: "base", title: "通常料金", table: tables.base },
    { key: "discount", title: "条件付きの料金", table: tables.discount },
  ].filter(section => section.table.rows.length > 0);

  const fees = data.fees.filter(fee => fee.amount != null);
  const tags = new Set(
    sections.flatMap(section =>
      section.table.rows.flatMap(row =>
        [...row.cells.values()].flatMap(cell =>
          cell.entries.map(entry => entry.purchaseTag),
        ),
      ),
    ),
  );

  return (
    <div className="flex flex-col gap-4">
      {sharedPartners.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {modes.map(([value, label]) => {
            const isActive = mode === value;
            return (
              <Button
                key={value}
                type="button"
                size="xs"
                variant={isActive ? "default" : "outline"}
                className={cn(
                  "h-8 px-3 rounded-full",
                  !isActive && "text-gray-700",
                )}
                onClick={() => setMode(value)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}

      {sections.map(section => (
        <div key={section.key} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-gray-900 text-sm font-semibold font-[var(--font-heading)]">
              {section.title}
            </p>
            <SourceLinks
              numbers={tableSourcesOf(section.table)}
              references={tables.references}
            />
          </div>
          {section.key === "discount" && (
            <p className="text-gray-500 text-xs">
              会員・宿泊者・特定日などの条件があります。詳細は公式サイトで確認してください。
            </p>
          )}
          <PriceGrid table={section.table} />
        </div>
      ))}

      {sections.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500 text-sm font-semibold">
              この区分の料金はありません。
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-gray-500 text-xs leading-relaxed">
        単位: 円
        {data.calculation_policy?.tax_included === true ? "（税込）" : ""}
        {tags.has("Web") && (
          <>
            ・<span className="text-blue-700 font-bold">青字</span>は
            Webで買った場合の料金（下の小さい数字は窓口）
          </>
        )}
        {tags.has("前売") && !tags.has("Web") && "・青字は前売の料金"}
        {fees.length > 0 &&
          `・別途 ${fees
            .map(
              fee =>
                `${fee.official_label_ja ?? fee.name_ja} ${(fee.amount ?? 0).toLocaleString("ja-JP")}円`,
            )
            .join(" / ")}`}
      </p>
    </div>
  );
};
