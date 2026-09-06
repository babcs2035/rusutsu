"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  REVIEW_CATEGORY_IDS,
  REVIEW_CATEGORY_LABELS,
  type ResortReviewCategory,
  type ReviewCategoryId,
  type ReviewScore,
} from "@/features/reviews/types";
import { getResortLabelName } from "@/lib/resortAliases";
import { cn } from "@/lib/utils";
import type { Resort } from "./types";

const SCORE_STYLES: Record<ReviewScore, string> = {
  "◎": "bg-green-100 text-green-900",
  "○": "bg-blue-100 text-blue-900",
  "△": "bg-orange-100 text-orange-900",
};

/**
 * article.json の good / bad は文章なので、「。」で切って箇条書きにする。
 * 読点までで切ると意味が壊れるため、句点だけを区切りにする。
 */
const toBulletPoints = (text: string | null): string[] => {
  if (!text) return [];

  return text
    .split("。")
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0)
    .map(sentence => `${sentence}。`);
};

const getCategory = (
  resort: Resort,
  categoryId: ReviewCategoryId,
): ResortReviewCategory | null =>
  resort.reviewData?.categories.find(category => category.id === categoryId) ??
  null;

/**
 * 比較の「レビュー」タブ。
 *
 * 表に押し込むと 1 マスあたりの文字数が足りず、どれも同じに見えてしまう。
 * 項目を 1 つ選び、スキー場ごとに「名前＋評価」の 1 行と、
 * その理由の箇条書きを縦に並べる。
 */
export const CompareReviewsTab = ({ resorts }: { resorts: Resort[] }) => {
  const scoredCategoryIds = useMemo(
    () =>
      REVIEW_CATEGORY_IDS.filter(categoryId =>
        resorts.some(resort => getCategory(resort, categoryId)?.score),
      ),
    [resorts],
  );
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<ReviewCategoryId | null>(null);
  // 評価が付いている項目を先に出す。1 つも無ければ既定の並びをそのまま出す
  const categoryIds =
    scoredCategoryIds.length > 0 ? scoredCategoryIds : REVIEW_CATEGORY_IDS;
  const activeCategoryId = selectedCategoryId ?? categoryIds[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="scroll-touch flex gap-2 overflow-x-auto pb-0.5">
        {categoryIds.map(categoryId => {
          const isActive = activeCategoryId === categoryId;
          return (
            <Button
              key={categoryId}
              type="button"
              variant={isActive ? "default" : "outline"}
              aria-pressed={isActive}
              className="h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold"
              onClick={() => setSelectedCategoryId(categoryId)}
            >
              {REVIEW_CATEGORY_LABELS[categoryId]}
            </Button>
          );
        })}
      </div>

      {resorts.map(resort => (
        <ResortReviewBlock
          key={resort.id}
          resort={resort}
          category={getCategory(resort, activeCategoryId)}
        />
      ))}
    </div>
  );
};

const ResortReviewBlock = ({
  resort,
  category,
}: {
  resort: Resort;
  category: ResortReviewCategory | null;
}) => {
  const goodPoints = toBulletPoints(category?.good ?? null);
  const concernPoints = toBulletPoints(category?.concern ?? null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 font-[var(--font-heading)]">
          {getResortLabelName(resort.id, resort.nameJa, resort.shortName)}
        </h3>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base font-bold leading-none",
            category?.score
              ? SCORE_STYLES[category.score]
              : "bg-gray-100 text-gray-400",
          )}
        >
          {category?.score ?? "—"}
        </span>
      </div>

      {goodPoints.length === 0 && concernPoints.length === 0 ? (
        <p className="mt-2 text-xs font-medium text-gray-400">
          {resort.reviewData ? "評価記事が未作成" : "レビューデータなし"}
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2.5">
          <BulletList
            title="良い点"
            titleClassName="text-green-900"
            markerClassName="bg-green-500"
            points={goodPoints}
          />
          <BulletList
            title="気になる点"
            titleClassName="text-orange-900"
            markerClassName="bg-orange-500"
            points={concernPoints}
          />
          {category && category.courses.length > 0 && (
            <BulletList
              title="代表的なコース"
              titleClassName="text-blue-900"
              markerClassName="bg-blue-500"
              points={category.courses}
            />
          )}
        </div>
      )}
    </div>
  );
};

const BulletList = ({
  title,
  titleClassName,
  markerClassName,
  points,
}: {
  title: string;
  titleClassName: string;
  markerClassName: string;
  points: string[];
}) => {
  if (points.length === 0) return null;

  return (
    <div>
      <p className={cn("text-[11px] font-semibold", titleClassName)}>{title}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {points.map(point => (
          <li key={point} className="flex gap-1.5">
            <span
              className={cn(
                "mt-[0.4rem] h-1 w-1 shrink-0 rounded-full",
                markerClassName,
              )}
            />
            <span className="text-[13px] leading-relaxed text-gray-700">
              {point}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
