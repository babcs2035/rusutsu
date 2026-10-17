"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LiftTicketData } from "../types";
import { buildRentalPriceTables } from "../utils/rentalPriceTable";
import { PriceGrid, tableSourcesOf } from "./LiftTicketPriceTable";
import { SourceLinks } from "./SourceLinks";

/**
 * 公式レンタル料金表。リフト券の料金表と同じ見た目で、
 * 行＝用具、小行＝期間（1日・半日・2日間…）、列＝対象者
 */
export const RentalPriceTable = ({ data }: { data: LiftTicketData }) => {
  const [duration, setDuration] = useState<string | null>(null);
  const tables = useMemo(
    () => buildRentalPriceTables(data, { duration }),
    [data, duration],
  );
  const selected =
    duration && tables.durations.includes(duration)
      ? duration
      : tables.durations.includes("1日")
        ? "1日"
        : tables.durations[0];
  const sections = [
    { key: "base", title: "通常料金", table: tables.base },
    { key: "conditional", title: "条件付きの料金", table: tables.conditional },
  ].filter(section => section.table.rows.length > 0);
  if (tables.durations.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* 期間ごとに表を切り替える（小行に並べると縦に長くなりすぎる） */}
      {tables.durations.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {tables.durations.map(label => {
            const isActive = label === selected;
            return (
              <Button
                key={label}
                type="button"
                size="xs"
                variant={isActive ? "default" : "outline"}
                className={cn(
                  "h-7 px-2.5 rounded-full whitespace-nowrap",
                  !isActive && "text-gray-700",
                )}
                aria-pressed={isActive}
                onClick={() => setDuration(label)}
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
          {section.key === "conditional" && (
            <p className="text-gray-500 text-xs">
              宿泊者限定などの条件があります。詳細は公式サイトで確認してください。
            </p>
          )}
          <PriceGrid table={section.table} firstColumnLabel="用具" />
        </div>
      ))}
      <p className="text-gray-500 text-xs leading-relaxed">単位: 円</p>
    </div>
  );
};
