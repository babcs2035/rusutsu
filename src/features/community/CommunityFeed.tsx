"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCommunityFeed } from "@/features/community/actions";
import type {
  FeedInput,
  PublicPost,
  PublicReportEntry,
} from "@/features/community/contract";
import type { SelectedMapFeature } from "@/features/map/types";
import { cn } from "@/lib/utils";
import {
  communityComposerUrl,
  highlightCommunityPost,
  requestCommunityComposer,
} from "./composerEvents";
import {
  type CommunityPeriod,
  getPeriodStart,
  todayInJapan,
} from "./mapOverlay";
import { PostInteractions } from "./PostInteractions";
import { ReportSections } from "./ReportSections";

const PERIODS: Record<CommunityPeriod, string> = {
  all: "全期間",
  season: "今シーズン",
  "7d": "過去1週間",
  "3d": "過去3日",
};
// 表示期間を選ぶと、その期間の滑走日を開始・終了の日付欄に入れる
const periodRange = (period: CommunityPeriod) =>
  period === "all"
    ? { from: "", to: "" }
    : { from: getPeriodStart(period) ?? "", to: todayInJapan() };
// 日付欄を手で変えたときは、どの表示期間にも当たらなければ「期間指定」にする
const matchingPeriod = (from: string, to: string) =>
  (Object.keys(PERIODS) as CommunityPeriod[]).find(period => {
    const range = periodRange(period);
    return range.from === from && range.to === to;
  }) ?? "custom";
const KINDS = { "": "すべて", COURSE: "コース", LIFT: "リフト" } as const;
const SORTS = { observed: "滑走日順", created: "投稿日順" } as const;
const selectTriggerClass =
  "w-full min-w-0 bg-white px-1.5 text-xs data-[size=sm]:h-8";

function ToolbarSelect<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: T;
  /** 表示中の値だけに出す選択肢（期間指定など）があるので、全部そろっていなくてよい */
  items: Partial<Record<T, string>>;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      value={value}
      items={items}
      onValueChange={next => onChange(next as T)}
    >
      <SelectTrigger
        size="sm"
        aria-label={label}
        className={selectTriggerClass}
      >
        <SelectValue className="min-w-0 truncate" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {(Object.entries(items) as [T, string][]).map(([key, text]) => (
          <SelectItem key={key} value={key}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// 投稿の対象（コース・リフト）と場所を、地図に強調表示する形にする
function mapHighlight(entry: PublicReportEntry | undefined) {
  if (!entry) return null;
  const feature: SelectedMapFeature | null =
    entry.kind === "LIFT" && entry.liftId
      ? { kind: "lift", id: entry.liftId }
      : entry.courseId
        ? { kind: "course", id: entry.courseId }
        : null;
  const point: [number, number] | null =
    entry.latitude != null && entry.longitude != null
      ? [entry.longitude, entry.latitude]
      : null;
  return feature || point ? { feature, point } : null;
}

export function CommunityFeed({
  resortId,
  courseId,
  liftId,
  compact = false,
  hideHeading = false,
  highlightOnMap = false,
}: {
  resortId: string;
  courseId?: string;
  liftId?: string;
  /** コース・リフト詳細の中に出す短い一覧 */
  compact?: boolean;
  hideHeading?: boolean;
  /** 投稿を押したとき、地図にその投稿の対象と場所を出す */
  highlightOnMap?: boolean;
}) {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [sort, setSort] = useState<"observed" | "created">("observed");
  const [kind, setKind] = useState<keyof typeof KINDS>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const period = matchingPeriod(from, to);
  const query: FeedInput = {
    resortId,
    courseId,
    liftId,
    kind: kind || undefined,
    from: from || undefined,
    to: to || undefined,
    sort,
  };
  const queryKey = JSON.stringify(query);
  useEffect(() => {
    let active = true;
    setBusy(true);
    void getCommunityFeed(JSON.parse(queryKey) as FeedInput).then(result => {
      if (!active) return;
      if (result.ok) {
        setPosts(result.data.posts);
        setNextCursor(result.data.nextCursor);
      }
      setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [queryKey]);
  useEffect(() => {
    if (!highlightOnMap) return;
    const post = posts.find(item => item.id === selectedPostId);
    highlightCommunityPost(resortId, mapHighlight(post?.entries[0]));
  }, [highlightOnMap, posts, resortId, selectedPostId]);
  // 一覧を離れたら地図の強調を消す
  useEffect(
    () => () => {
      if (highlightOnMap) highlightCommunityPost(resortId, null);
    },
    [highlightOnMap, resortId],
  );
  const loadMore = () => {
    if (!nextCursor) return;
    void getCommunityFeed({ ...query, cursor: nextCursor }).then(result => {
      if (result.ok) {
        setPosts(all => [...all, ...result.data.posts]);
        setNextCursor(result.data.nextCursor);
      }
    });
  };
  const target = courseId
    ? { kind: "COURSE" as const, id: courseId }
    : liftId
      ? { kind: "LIFT" as const, id: liftId }
      : undefined;
  const postLink = (
    <Link
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md bg-blue-600 px-2 text-xs font-bold whitespace-nowrap text-white shadow-sm hover:bg-blue-700",
        compact && "h-7",
      )}
      href={communityComposerUrl({ resortId, target })}
      onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        if (requestCommunityComposer({ resortId, target }))
          event.preventDefault();
      }}
    >
      <Plus className="size-3.5" strokeWidth={3} />
      投稿
    </Link>
  );
  return (
    <section className="space-y-2" aria-label="みんなの投稿">
      {compact ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!hideHeading && <h3 className="font-semibold">みんなの投稿</h3>}
          <div className="flex items-center gap-2 text-xs">
            {courseId && (
              <Link
                className="rounded-md border px-2 py-1.5 font-medium whitespace-nowrap"
                href={`/community/${encodeURIComponent(resortId)}/photos?courseId=${encodeURIComponent(courseId)}`}
              >
                コースの写真
              </Link>
            )}
            <Link
              className="rounded-md border px-2 py-1.5 font-medium whitespace-nowrap"
              href={`/community/${encodeURIComponent(resortId)}`}
            >
              すべて見る
            </Link>
            {postLink}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-center gap-1">
            <ToolbarSelect<CommunityPeriod | "custom">
              label="表示期間"
              value={period}
              items={
                period === "custom"
                  ? { ...PERIODS, custom: "期間指定" }
                  : PERIODS
              }
              onChange={next => {
                if (next === "custom") return;
                const range = periodRange(next);
                setFrom(range.from);
                setTo(range.to);
              }}
            />
            <ToolbarSelect
              label="表示する項目"
              value={kind}
              items={KINDS}
              onChange={setKind}
            />
            <ToolbarSelect
              label="並び順"
              value={sort}
              items={SORTS}
              onChange={setSort}
            />
            {postLink}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <input
              aria-label="開始日"
              type="date"
              className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-1.5"
              value={from}
              max={to || undefined}
              onChange={event => setFrom(event.target.value)}
            />
            〜
            <input
              aria-label="終了日"
              type="date"
              className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-1.5"
              value={to}
              min={from || undefined}
              onChange={event => setTo(event.target.value)}
            />
          </div>
        </div>
      )}
      {busy ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-500">まだ投稿はありません。</p>
      ) : (
        <div className="space-y-2">
          {posts.slice(0, compact ? 2 : undefined).map(post => (
            <PostCard
              key={post.id}
              post={post}
              showResort={false}
              selected={highlightOnMap && post.id === selectedPostId}
              onSelect={
                highlightOnMap
                  ? () =>
                      setSelectedPostId(current =>
                        current === post.id ? null : post.id,
                      )
                  : undefined
              }
            />
          ))}
        </div>
      )}
      {!compact && nextCursor && (
        <button
          type="button"
          className="w-full rounded border py-2 text-sm"
          onClick={loadMore}
        >
          もっと見る
        </button>
      )}
    </section>
  );
}

export function PostCard({
  post,
  showResort = true,
  selected = false,
  onSelect,
}: {
  post: PublicPost;
  /** スキー場の中の一覧ではスキー場名を出さない */
  showResort?: boolean;
  selected?: boolean;
  /** 押すと地図に対象を出す。リンクや写真を押したときは呼ばない */
  onSelect?: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: キーボードでは下の「地図に表示」ボタンで同じ操作ができる
    <article
      className={cn(
        "rounded-lg border p-3 text-sm",
        onSelect && "cursor-pointer",
        selected ? "border-blue-600 ring-1 ring-blue-600" : "border-gray-200",
      )}
      onClick={event => {
        if (!onSelect) return;
        if (
          (event.target as HTMLElement).closest(
            "a,button,input,select,textarea,form",
          )
        )
          return;
        onSelect();
      }}
    >
      {showResort && (
        <div className="mb-1 font-semibold">
          現地レポート
          <span className="ml-1 text-xs font-normal text-slate-500">
            {post.resortName}
          </span>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <Link
          className="min-w-0 truncate text-sm font-bold text-gray-900 hover:underline md:text-base"
          href={`/profile/${encodeURIComponent(post.author.id)}`}
        >
          {post.author.publicName}
        </Link>
        <time className="shrink-0 text-xs text-gray-500 tabular-nums">
          <span className="mr-1 text-gray-400">滑走日時</span>
          {post.observedOn} {post.observedTime}
        </time>
      </div>
      <div className="mt-1.5">
        <ReportSections entries={post.entries} bare />
      </div>
      <PostInteractions post={post} />
      {onSelect && (
        <button
          type="button"
          aria-pressed={selected}
          className="sr-only focus:not-sr-only focus:text-xs"
          onClick={onSelect}
        >
          地図に表示
        </button>
      )}
    </article>
  );
}
