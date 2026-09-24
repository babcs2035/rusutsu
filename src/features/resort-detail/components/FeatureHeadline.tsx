"use client";

import { ExternalLink, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatUpdatedAt,
  getSourceLabel,
  getYoutubeSearchUrl,
} from "../utils/featureLinks";

export type HeadlineItem = {
  label: string;
  text: string;
  /** 記号から決まる色。営業状況・圧雪に付ける */
  tone?: "open" | "limited" | "closed" | null;
};

const TONE_CLASS: Record<"open" | "limited" | "closed", string> = {
  open: "text-green-700",
  limited: "text-amber-700",
  closed: "text-red-700",
};

/**
 * 難易度・営業状況・圧雪を上にまとめて大きく出す。
 *
 * 記号だけだと意味を凡例で explain しないと読めないので、文字で書く。
 * 難易度は「難易度」というラベルを付けず、その色の下地に文字を載せて示す。
 */
export const FeatureHeadline = ({
  difficulty,
  items,
  update,
  searchWord,
  sourceUrls,
}: {
  difficulty?: { label: string; color: string } | null;
  items: HeadlineItem[];
  update?: string | null;
  /** YouTube でこのコース・リフトを探すための検索語 */
  searchWord?: string | null;
  /** 公式サイトの出典 */
  sourceUrls?: string[];
}) => {
  const updatedAt = formatUpdatedAt(update);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {difficulty && (
          <span
            className="rounded-md px-2.5 py-1 text-base font-bold leading-none text-white"
            style={{ background: difficulty.color }}
          >
            {difficulty.label}
          </span>
        )}
        {items.map(item => (
          <span key={item.label} className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-gray-500">
              {item.label}
            </span>
            <span
              className={cn(
                "text-base font-bold leading-none",
                item.tone ? TONE_CLASS[item.tone] : "text-gray-900",
              )}
            >
              {item.text}
            </span>
          </span>
        ))}
      </div>

      {(updatedAt || searchWord || (sourceUrls?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          {updatedAt && (
            <span className="font-medium text-gray-500">{updatedAt}</span>
          )}
          {searchWord && (
            <a
              href={getYoutubeSearchUrl(searchWord)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-semibold text-red-600 hover:underline"
            >
              <Play size={13} fill="currentColor" />
              動画を探す
            </a>
          )}
          {sourceUrls?.map(url => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-medium text-gray-500 hover:text-gray-800 hover:underline"
            >
              <ExternalLink size={12} />
              出典: {getSourceLabel(url)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

/** 1 行に並べる数値。標高差のように補足がある項目は 2 行目に小さく出す */
export const FeatureMetric = ({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string | null;
}) => (
  <div className="min-w-0 border-b border-gray-200 pb-2">
    <p className="truncate text-[11px] font-medium text-gray-500">{title}</p>
    <p className="truncate text-base font-semibold text-gray-900">{value}</p>
    {detail && (
      <p className="truncate text-[10px] font-medium text-gray-500">{detail}</p>
    )}
  </div>
);
