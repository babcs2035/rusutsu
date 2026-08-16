"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { LiftTicketData } from "../types";
import { sharedResortsOf } from "../types";
import type {
  PriceCell,
  PriceReference,
  PriceTable,
} from "../utils/priceTable";
import { buildLiftTicketPriceTables } from "../utils/priceTable";
import { SourceList, SourceMarks } from "./SourceMarks";

/** 単独券（このスキー場だけ）か共通券（他のスキー場でも使える）か */
type TableMode = "single" | "shared";

/**
 * 1セル。日付によって料金が変わる券は「平日：6,300円 / 土日：6,800円」と
 * 同じセルに並べる（公式サイトの料金表と同じ見え方）。
 */
const PriceCellBody = ({
  cell,
  references,
}: {
  cell: PriceCell | undefined;
  references: PriceReference[];
}) => {
  if (!cell || cell.entries.length === 0) {
    return <p className="text-gray-500 text-sm">—</p>;
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      {cell.entries.map(entry => (
        <p
          key={entry.offerId}
          className={cn(
            "text-gray-900 whitespace-nowrap",
            entry.amount == null
              ? "text-xs font-medium"
              : "text-sm font-bold font-mono",
          )}
        >
          {entry.calendarLabel && (
            <span className="mr-1 text-gray-600 text-[0.6875rem] font-semibold">
              {entry.calendarLabel}：
            </span>
          )}
          {entry.text}
          <SourceMarks numbers={entry.sourceNumbers} references={references} />
        </p>
      ))}
    </div>
  );
};

const PriceGrid = ({
  table,
  references,
}: {
  table: PriceTable;
  references: PriceReference[];
}) => (
  <Card className="w-full overflow-x-auto">
    <CardContent
      className="p-0"
      style={{ minWidth: `${260 + table.audiences.length * 140}px` }}
    >
      <Table className="w-full">
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="table-header-cell">券種</TableHead>
            {table.audiences.map(audience => (
              <TableHead
                key={audience.id}
                className="table-header-cell"
                // .table-header-cell は unlayered CSS で text-align: left を持つため，
                // ユーティリティの text-right では上書きできない（§4 参照）．
                // 本文セル（text-right）と揃えるためインラインで右揃えを指定する．
                style={{ textAlign: "right" }}
              >
                {audience.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map(row => (
            <TableRow key={row.key} className="border-gray-200">
              <TableCell className="px-4 py-3 min-w-[240px] align-top">
                <p className="text-gray-900 font-semibold">{row.label}</p>
                {row.subLabel && (
                  <p className="mt-0.5 text-gray-600 text-[0.6875rem]">
                    {row.subLabel}
                  </p>
                )}
                {row.conditions.map(condition => (
                  <p
                    key={condition}
                    className="mt-0.5 text-gray-600 text-[0.6875rem] leading-snug"
                  >
                    {condition}
                  </p>
                ))}
                {row.notes.length > 0 && (
                  <p className="mt-0.5 text-gray-500 text-[0.6875rem] leading-snug">
                    {row.notes.join(" / ")}
                  </p>
                )}
              </TableCell>
              {/* 全区分で同額なら1つのセルに結合する（回数券は大人・子供同額） */}
              {row.spansAllAudiences ? (
                <TableCell
                  className="px-4 py-3 text-center"
                  style={{ gridColumn: `span ${table.audiences.length}` }}
                >
                  <div className="flex justify-center">
                    <PriceCellBody
                      cell={row.cells.get(table.audiences[0].id)}
                      references={references}
                    />
                  </div>
                </TableCell>
              ) : (
                table.audiences.map(audience => (
                  <TableCell
                    key={audience.id}
                    className="px-4 py-3 text-right align-top"
                  >
                    <PriceCellBody
                      cell={row.cells.get(audience.id)}
                      references={references}
                    />
                  </TableCell>
                ))
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

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

  const sections = [
    { key: "base", title: "基本料金", table: tables.base },
    { key: "discount", title: "割引・条件付き料金", table: tables.discount },
  ].filter(section => section.table.rows.length > 0);

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

      {/* 基本料金と条件付き料金を分ける。同じ表に並べると
          「誰でもその値段で買える」と誤読される */}
      {sections.map(section => (
        <div key={section.key} className="flex flex-col gap-2">
          <p className="text-gray-900 text-sm font-semibold font-[var(--font-heading)]">
            {section.title}
          </p>
          {section.key === "discount" && (
            <p className="text-gray-500 text-xs leading-relaxed">
              対象者・購入方法・期限の条件があります。行の下の注記を確認してください。
            </p>
          )}
          <PriceGrid table={section.table} references={tables.references} />
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

      {data.fees.length > 0 && (
        <p className="text-gray-500 text-xs leading-relaxed">
          別途:{" "}
          {data.fees
            .filter(fee => fee.amount != null)
            .map(
              fee =>
                `${fee.official_label_ja ?? fee.name_ja} ¥${(fee.amount ?? 0).toLocaleString("ja-JP")}`,
            )
            .join(" / ")}
        </p>
      )}

      <SourceList references={tables.references} />

      <p className="text-gray-500 text-xs leading-relaxed">
        {data.season.label_ja}
        {data.calculation_policy?.tax_included === true
          ? "・税込"
          : "・税込表記は公式確認が必要"}
      </p>
    </div>
  );
};
