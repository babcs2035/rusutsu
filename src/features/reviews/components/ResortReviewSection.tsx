"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ResortReviewData, ReviewCategoryId, ReviewScore } from "../types";

/**
 * スコアに応じたTailwindクラスセット。
 * 指針20節: 固定値の color/backgroundColor を style で指定しない。
 */
const SCORE_STYLES: Record<
  ReviewScore,
  { bg: string; text: string; border: string; borderFocus: string }
> = {
  "◎": {
    bg: "bg-green-100",
    text: "text-green-900",
    border: "border-green-300",
    borderFocus: "border-green-900",
  },
  "○": {
    bg: "bg-blue-100",
    text: "text-blue-900",
    border: "border-blue-300",
    borderFocus: "border-blue-900",
  },
  "△": {
    bg: "bg-orange-100",
    text: "text-orange-900",
    border: "border-orange-300",
    borderFocus: "border-orange-900",
  },
};

export const ResortReviewSection = ({
  review,
}: {
  review: ResortReviewData;
}) => {
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<ReviewCategoryId | null>(null);
  const selectedCategory = review.categories.find(
    category => category.id === selectedCategoryId,
  );
  const scoredCategories = review.categories.filter(
    category => category.score !== null,
  );

  return (
    <section>
      <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
        滑走者レビューから分かる特徴
      </h2>
      {review.fullArticle ? (
        <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-gray-700">
          {review.fullArticle}
        </p>
      ) : (
        <Alert className="mt-4 border-orange-300 bg-orange-50">
          <AlertTitle className="text-sm font-semibold text-orange-900">
            調査詳細はありますが、表示用の概要記事がまだありません。
          </AlertTitle>
        </Alert>
      )}

      {scoredCategories.length > 0 && (
        <>
          <p className="mt-5 mb-2 text-xs font-semibold text-gray-600">
            項目をタップすると詳しい評価が開きます
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {scoredCategories.map(category => {
              const score = category.score as ReviewScore;
              const styles = SCORE_STYLES[score];
              const isSelected = selectedCategoryId === category.id;
              return (
                <Button
                  key={category.id}
                  type="button"
                  variant="outline"
                  className={cn(
                    "flex min-h-12 flex-1 flex-col items-stretch justify-between gap-0 rounded-xl border px-3 py-2 text-left",
                    styles.bg,
                    styles.text,
                    isSelected ? styles.borderFocus : styles.border,
                    isSelected ? "shadow-sm" : "",
                  )}
                  onClick={() =>
                    setSelectedCategoryId(current =>
                      current === category.id ? null : category.id,
                    )
                  }
                >
                  <span>
                    <span className="block text-xs">{category.label}</span>
                    <span className="block text-xl leading-none">{score}</span>
                  </span>
                  {isSelected ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              );
            })}
          </div>
        </>
      )}

      {selectedCategory && (
        <Card className="mt-3">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-2">
              <p className="section-heading">{selectedCategory.label}</p>
              {selectedCategory.score && (
                <Badge
                  className={cn(
                    SCORE_STYLES[selectedCategory.score].bg,
                    SCORE_STYLES[selectedCategory.score].text,
                  )}
                >
                  {selectedCategory.score}
                </Badge>
              )}
            </div>
            {selectedCategory.good && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-green-900">良い点</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-700">
                  {selectedCategory.good}
                </p>
              </div>
            )}
            {selectedCategory.concern && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-orange-900">
                  気になる点
                </p>
                <p className="mt-1 text-sm leading-relaxed text-gray-700">
                  {selectedCategory.concern}
                </p>
              </div>
            )}
            {selectedCategory.courses.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-blue-900">
                  代表的なコース情報
                </p>
                <div className="mt-1.5 flex flex-col gap-2">
                  {selectedCategory.courses.map(course => (
                    <p
                      key={course}
                      className="text-sm leading-relaxed text-gray-700"
                    >
                      ・{course}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {review.dataIssues.length > 0 && (
        <p className="mt-3 text-[0.6875rem] leading-relaxed text-gray-500">
          データ注記: {review.dataIssues.join(" / ")}
        </p>
      )}
    </section>
  );
};
