"use client";

import { useState } from "react";
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
import {
  REVIEW_CATEGORY_IDS,
  REVIEW_CATEGORY_LABELS,
  type ReviewCategoryId,
  type ReviewScore,
} from "@/features/reviews/types";
import type { Resort } from "./types";

const SCORE_COLORS: Record<ReviewScore, string> = {
  "◎": "text-green-900",
  "○": "text-blue-900",
  "△": "text-orange-900",
};

const truncate = (value: string | null, maxLength = 92) => {
  if (!value) return null;
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength).trim()}…`;
};

export const CompareReviewsTab = ({ resorts }: { resorts: Resort[] }) => {
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<
    ReviewCategoryId[]
  >(["beginner", "intermediate", "powder"]);

  const toggleCategory = (categoryId: ReviewCategoryId) => {
    setSelectedCategoryIds(current =>
      current.includes(categoryId)
        ? current.filter(id => id !== categoryId)
        : [...current, categoryId],
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-gray-900 font-[var(--font-heading)]">
          比較するレビュー項目
        </p>
        <p className="mt-1 text-xs text-gray-500">
          気になる滑り方だけを選ぶと、横並びで比較しやすくなります。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {REVIEW_CATEGORY_IDS.map(categoryId => {
            const isSelected = selectedCategoryIds.includes(categoryId);
            return (
              <Button
                key={categoryId}
                type="button"
                size="sm"
                variant={isSelected ? "default" : "outline"}
                className={`h-8 rounded-full px-3 text-xs`}
                aria-pressed={isSelected}
                onClick={() => toggleCategory(categoryId)}
              >
                {REVIEW_CATEGORY_LABELS[categoryId]}
              </Button>
            );
          })}
        </div>
      </div>

      {selectedCategoryIds.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-500">
              比較する項目を1つ以上選んでください。
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full overflow-x-auto py-0">
          <CardContent className="p-0">
            <Table
              style={{
                minWidth: `${220 + selectedCategoryIds.length * 240}px`,
              }}
            >
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="table-header-cell">スキー場</TableHead>
                  {selectedCategoryIds.map(categoryId => (
                    <TableHead key={categoryId} className="table-header-cell">
                      {REVIEW_CATEGORY_LABELS[categoryId]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {resorts.map(resort => (
                  <TableRow
                    key={resort.id}
                    className="border-b border-gray-200"
                  >
                    <TableCell className="min-w-[220px] px-4 py-4 align-top">
                      <p className="font-bold text-gray-900 font-[var(--font-heading)]">
                        {resort.nameJa}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {resort.prefecture} • {resort.town}
                      </p>
                    </TableCell>
                    {selectedCategoryIds.map(categoryId => {
                      const category = resort.reviewData?.categories.find(
                        candidate => candidate.id === categoryId,
                      );
                      return (
                        <TableCell
                          key={categoryId}
                          className="min-w-[240px] px-4 py-4 align-top"
                        >
                          {category?.score ? (
                            <>
                              <p
                                className={`${SCORE_COLORS[category.score]} text-2xl font-bold leading-none`}
                              >
                                {category.score}
                              </p>
                              <p className="mt-2 text-xs leading-relaxed text-gray-700">
                                {truncate(category.good) ??
                                  truncate(category.article) ??
                                  "評価本文はありません。"}
                              </p>
                              {category.concern && (
                                <p className="mt-2 text-[0.6875rem] leading-snug text-orange-900">
                                  注意: {truncate(category.concern, 70)}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-gray-400">
                              {resort.reviewData
                                ? "評価記事が未作成"
                                : "レビューデータなし"}
                            </p>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
