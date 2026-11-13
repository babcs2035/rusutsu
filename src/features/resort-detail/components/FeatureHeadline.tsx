"use client";

import { Circle, Minus, Pencil, Play, Triangle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { requestCommunityComposer } from "@/features/community/composerEvents";
import {
  type CorrectionTarget,
  correctionUrl,
  requestCorrection,
} from "@/features/corrections/correctionEvents";
import { cn } from "@/lib/utils";
import type { GroomingLabel, StatusSymbol } from "../utils/detailMetrics";
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
const GROOMING_CLASS: Record<GroomingLabel, string> = {
  圧雪: "text-cyan-700",
  日によって圧雪: "text-violet-700",
  非圧雪: "text-fuchsia-700",
};
// ナイターは地図の縁取りと同じ黄色、早朝は朝の空の水色
const HOURS_CLASS = {
  morning: "border-sky-300 bg-sky-50 text-sky-800",
  night: "border-yellow-300 bg-yellow-100 text-yellow-800",
};
// Preserve the map's level colors while making small text readable on white.
const LEVEL_TEXT_COLOR: Record<string, string> = {
  "#22C55E": "#15803D",
  "#FF8C00": "#9A3412",
  "#FF0000": "#B91C1C",
  "#A855F7": "#7E22CE",
};
const TAG_CLASS =
  "inline-flex h-6 shrink-0 items-center rounded-full border px-2 align-middle text-xs font-semibold whitespace-nowrap";

/** レベル・圧雪・早朝・ナイター（リフトは種別・速度）の値チップ。名前の横に並べる */
export const FeatureTags = ({
  difficulty,
  grooming = [],
  hours = [],
  tags = [],
}: {
  difficulty?: { label: string; color: string } | null;
  grooming?: Array<{ label: string; value: GroomingLabel }>;
  hours?: Array<{ label: string; kind: keyof typeof HOURS_CLASS }>;
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
    {grooming.map(item => (
      <span
        key={item.label}
        className={cn(
          TAG_CLASS,
          "border-slate-200 bg-slate-50",
          GROOMING_CLASS[item.value],
        )}
      >
        {item.label}
      </span>
    ))}
    {hours.map(item => (
      <span key={item.label} className={cn(TAG_CLASS, HOURS_CLASS[item.kind])}>
        {item.label}
      </span>
    ))}
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

// 地図の「＋投稿」「営業中のみ」と同じ文字・枠
const ACTION_CLASS =
  "h-8 gap-1 rounded-md border border-slate-300 bg-white px-1.5 text-sm font-semibold whitespace-nowrap text-slate-700 shadow-sm hover:bg-slate-50 md:text-[13px]";
// 投稿は青、動画は YouTube の赤で塗る
const POST_CLASS =
  "border-blue-600 bg-blue-600 text-white hover:bg-blue-700 hover:text-white";
const VIDEO_CLASS =
  "border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white";

/**
 * 営業状況を一番目立つチップで出し、その右に出典を折り返して添える。
 * 下の段に投稿・情報の修正・動画検索の操作を並べる。
 */
export const FeatureHeadline = ({
  kind,
  status,
  searchWord,
  sources,
  reportContext,
  postTarget,
  correctionTarget,
}: {
  kind: "course" | "lift";
  status: { symbol: StatusSymbol | null; text: string };
  searchWord?: string | null;
  sources: FeatureStatusSource[];
  reportContext?: {
    resortId: string;
    targetIds: string[];
    snapshotId?: string | null;
  };
  /** 投稿の対象。reportContext の resortId と組み合わせて使う */
  postTarget?: { kind: "COURSE" | "LIFT"; id: string };
  /** 「情報を修正」で直す対象。詳細パネルがその場で修正画面に切り替わる */
  correctionTarget?: CorrectionTarget;
}) => {
  const router = useRouter();
  const statusStyle = status.symbol
    ? STATUS_STYLE[status.symbol]
    : UNKNOWN_STATUS_STYLE;
  const label = kind === "course" ? "コース状況" : "リフト状況";
  const resortId = reportContext?.resortId;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
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

        {sources.length > 0 && (
          <div className="flex min-h-7 min-w-0 flex-1 flex-col justify-center gap-1">
            {sources.map(source => (
              <SourceLine
                key={JSON.stringify([source.urls, source.update])}
                label={label}
                urls={source.urls}
                updates={source.update ? [source.update] : []}
                highlights={source.matches.flatMap(
                  match => match.officialNames,
                )}
                showFetched={false}
                showLabel={false}
                compact
              />
            ))}
          </div>
        )}
      </div>

      {(resortId || searchWord) && (
        <div className="flex items-center gap-1.5">
          {resortId && postTarget && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(ACTION_CLASS, POST_CLASS)}
              onClick={() =>
                requestCommunityComposer({ resortId, target: postTarget })
              }
            >
              ＋投稿
            </Button>
          )}
          {resortId && correctionTarget && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={ACTION_CLASS}
              onClick={() => {
                const request = { resortId, target: correctionTarget };
                // 詳細パネルが無い画面（比較など）では、そのスキー場の詳細を開いて修正を始める
                if (!requestCorrection(request))
                  router.push(correctionUrl(request));
              }}
            >
              <Pencil aria-hidden="true" />
              情報を修正
            </Button>
          )}
          {searchWord && (
            <a
              href={getYoutubeSearchUrl(searchWord)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTubeで動画を探す"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                ACTION_CLASS,
                VIDEO_CLASS,
              )}
            >
              <Play aria-hidden="true" fill="currentColor" />
              動画を探す
            </a>
          )}
        </div>
      )}
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
    className="@container grid items-start gap-x-1 rounded-lg bg-slate-50 px-2.5 py-2 @min-[300px]:gap-x-1.5"
    style={{
      gridTemplateColumns: items
        .map(item =>
          item.title === "標高差" ? "minmax(0, 2fr)" : "minmax(0, 1fr)",
        )
        .join(" "),
    }}
  >
    {items.map(item => (
      <div
        key={item.title}
        className="min-w-0"
        title={item.detail ?? undefined}
      >
        <dt className="whitespace-nowrap text-[10px] leading-tight text-slate-500 @min-[420px]:text-xs">
          {item.title}
        </dt>
        <dd className="whitespace-nowrap text-[clamp(10px,3.8cqw,16px)] font-bold leading-5 tabular-nums tracking-tight text-slate-900 @min-[420px]:leading-6">
          {item.value}
        </dd>
        {item.detail && (
          <dd className="whitespace-nowrap text-[10px] tabular-nums tracking-tighter text-slate-500 @min-[420px]:text-xs">
            {item.detail}
          </dd>
        )}
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
          className="border-l-2 border-amber-300 pl-2 text-sm leading-snug text-slate-900"
        />
      )}
      {descriptions.length > 0 && (
        <ExpandableNote
          key={descriptions.join("\n")}
          label={descriptionLabel}
          labelClassName="border-slate-300 bg-slate-50 text-slate-600"
          texts={descriptions}
          className="border-l-2 border-slate-200 pl-2 text-sm leading-snug text-slate-600"
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
