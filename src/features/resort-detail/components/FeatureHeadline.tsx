"use client";

import { Circle, Minus, Play, Triangle, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { StatusSymbol } from "../utils/detailMetrics";
import { getYoutubeSearchUrl } from "../utils/featureLinks";
import type { FeatureStatusSource } from "../utils/featureSources";
import { SourceLine } from "./CompactInfo";

// 一覧の ○△× と同じ記号・同じ色。営業状況だけ塗りで目立たせる
const STATUS_STYLE = {
  "○": {
    Icon: Circle,
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
  "△": {
    Icon: Triangle,
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  "×": { Icon: X, className: "border-slate-300 bg-slate-100 text-slate-700" },
};
const UNKNOWN_STATUS_STYLE = {
  Icon: Minus,
  className: "border-slate-200 bg-white text-slate-500",
};
const GROOMING_CLASS = {
  圧雪: "text-cyan-700",
  一部圧雪: "text-violet-700",
  非圧雪: "text-fuchsia-700",
};
// Preserve the map's level colors while making small text readable on white.
const LEVEL_TEXT_COLOR: Record<string, string> = {
  "#22C55E": "#15803D",
  "#F2C94C": "#854D0E",
  "#E53935": "#B91C1C",
  "#B45309": "#92400E",
};
const TAG_CLASS =
  "inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-xs font-semibold whitespace-nowrap";

/** レベル・圧雪（リフトは種別・速度）の値チップ。名前の横に並べる */
export const FeatureTags = ({
  difficulty,
  grooming,
  tags = [],
}: {
  difficulty?: { label: string; color: string } | null;
  grooming?: keyof typeof GROOMING_CLASS | null;
  tags?: string[];
}) => (
  <>
    {difficulty && (
      <span
        className={cn(TAG_CLASS, "bg-white")}
        style={{
          borderColor: difficulty.color,
          color: LEVEL_TEXT_COLOR[difficulty.color] ?? difficulty.color,
        }}
      >
        {difficulty.label}
      </span>
    )}
    {grooming && (
      <span
        className={cn(
          TAG_CLASS,
          "border-slate-200 bg-slate-50",
          GROOMING_CLASS[grooming],
        )}
      >
        {grooming}
      </span>
    )}
    {tags.map(tag => (
      <span
        key={tag}
        className={cn(TAG_CLASS, "border-slate-200 bg-slate-50 text-slate-700")}
      >
        {tag}
      </span>
    ))}
  </>
);

/**
 * 営業状況を一番目立つチップで出し、余った右側に出典と動画検索を置く。
 */
export const FeatureHeadline = ({
  kind,
  status,
  searchWord,
  sources,
}: {
  kind: "course" | "lift";
  status: { symbol: StatusSymbol | null; text: string };
  searchWord?: string | null;
  sources: FeatureStatusSource[];
}) => {
  const statusStyle = status.symbol
    ? STATUS_STYLE[status.symbol]
    : UNKNOWN_STATUS_STYLE;
  const label = kind === "course" ? "コース状況" : "リフト状況";

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm font-bold whitespace-nowrap",
          statusStyle.className,
        )}
      >
        <statusStyle.Icon
          aria-hidden="true"
          className="size-4"
          strokeWidth={3}
        />
        {status.text}
      </span>

      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
        {sources.map(source => (
          <SourceLine
            key={JSON.stringify([source.urls, source.update])}
            label={label}
            urls={source.urls}
            updates={source.update ? [source.update] : []}
            highlights={source.matches.flatMap(match => match.officialNames)}
            showFetched={false}
            showLabel={false}
            compact
          />
        ))}
        {searchWord && (
          <a
            href={getYoutubeSearchUrl(searchWord)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="YouTubeで動画を探す"
            className="inline-flex min-h-7 items-center gap-0.5 whitespace-nowrap text-xs text-red-700 underline underline-offset-2 hover:text-red-900"
          >
            <Play size={12} fill="currentColor" aria-hidden="true" />
            動画
          </a>
        )}
      </div>
    </div>
  );
};

/** 距離・斜度などの数値を詰めて並べる帯 */
export const FeatureMetrics = ({
  items,
}: {
  items: Array<{ title: string; value: string; detail?: string | null }>;
}) => (
  <dl
    className="grid gap-1 rounded-lg bg-slate-50 px-2.5 py-2"
    style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
  >
    {items.map(item => (
      <div
        key={item.title}
        className="min-w-0"
        title={item.detail ?? undefined}
      >
        <dt className="whitespace-nowrap text-[10px] text-slate-500 sm:text-xs">
          {item.title}
        </dt>
        <dd className="whitespace-nowrap text-[13px] font-bold tabular-nums tracking-tight text-slate-900 sm:text-base">
          {item.value}
        </dd>
      </div>
    ))}
  </dl>
);

const NOTE_TOGGLE_CLASS =
  "whitespace-nowrap text-xs text-sky-700 underline underline-offset-2 hover:text-sky-900 md:text-sm";

/**
 * 囲みラベルに続けて本文を流し、2行目以降はラベルの下まで回り込ませる。
 * 1行に収まらないときは「続きを読む」で開き、末尾の「閉じる」で戻す。
 */
const ExpandableNote = ({
  label,
  labelClassName,
  texts,
  className,
}: {
  label: string;
  labelClassName: string;
  texts: string[];
  className: string;
}) => {
  const textRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    const measure = () =>
      setOverflowing(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  const badge = (
    <span
      className={cn(
        "mr-1.5 inline-flex shrink-0 items-center rounded border px-1 align-[1px] text-[11px] font-semibold leading-4 whitespace-nowrap md:text-xs",
        labelClassName,
      )}
    >
      {label}
    </span>
  );

  if (expanded) {
    return (
      <div className={className}>
        {texts.map((text, index) => (
          <p key={text}>
            {index === 0 && badge}
            {text}
            {index === texts.length - 1 && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label={`${label}を閉じる`}
                className={cn(NOTE_TOGGLE_CLASS, "ml-1.5")}
              >
                閉じる
              </button>
            )}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", className)}>
      {badge}
      <span ref={textRef} className="min-w-0 flex-1 truncate">
        {texts.join(" ／ ")}
      </span>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={`${label}の続きを読む`}
          className={cn(NOTE_TOGGLE_CLASS, "ml-1.5 shrink-0")}
        >
          続きを読む
        </button>
      )}
    </div>
  );
};

/**
 * クローラーで取った当日のコメント（最新情報）と、固定の紹介文を
 * 囲みラベルで分けて出す
 */
export const FeatureNotes = ({
  comments,
  descriptions = [],
  descriptionLabel = "コース紹介",
}: {
  comments: string[];
  descriptions?: string[];
  descriptionLabel?: string;
}) =>
  comments.length + descriptions.length > 0 ? (
    <div className="flex flex-col gap-1">
      {comments.length > 0 && (
        <ExpandableNote
          key={comments.join("\n")}
          label="最新情報"
          labelClassName="border-amber-300 bg-amber-50 text-amber-900"
          texts={comments}
          className="border-l-2 border-amber-300 pl-2 text-sm leading-snug text-slate-900 md:text-base"
        />
      )}
      {descriptions.length > 0 && (
        <ExpandableNote
          key={descriptions.join("\n")}
          label={descriptionLabel}
          labelClassName="border-slate-300 bg-slate-50 text-slate-600"
          texts={descriptions}
          className="border-l-2 border-slate-200 pl-2 text-sm leading-snug text-slate-600 md:text-base"
        />
      )}
    </div>
  ) : null;

/** 小見出し。詳細パネル内の各ブロックで共通にする */
export const FeatureSectionTitle = ({
  children,
  aside,
}: {
  children: string;
  aside?: string;
}) => (
  <div className="mb-1 flex items-baseline justify-between gap-2">
    <h3 className="text-xs font-semibold text-slate-500">{children}</h3>
    {aside && <span className="text-[11px] text-slate-400">{aside}</span>}
  </div>
);
