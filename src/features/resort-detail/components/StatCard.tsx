"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * 統計情報を表示するカード。
 * `interactive` を true にするとホバー時に浮き上がる効果がつく。
 * デフォルトは非インタラクティブ（ホバー効果なし）である。
 */
export const StatCard = ({
  title,
  value,
  valueColor = "text-gray-900",
  interactive = false,
}: {
  title: string;
  value: ReactNode;
  valueColor?: string;
  interactive?: boolean;
}) => (
  <Card
    className={`h-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm${
      interactive
        ? " transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-600 hover:shadow-md"
        : ""
    }`}
  >
    <CardContent className="p-3 md:p-4">
      <p className="truncate text-gray-500 text-[0.6875rem] font-medium md:text-xs whitespace-nowrap">
        {title}
      </p>
      <p
        className={`mt-1 md:mt-1.5 font-bold ${valueColor} text-sm md:text-base lg:text-lg leading-tight`}
      >
        {value}
      </p>
    </CardContent>
  </Card>
);
