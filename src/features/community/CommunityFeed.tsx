"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
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
  RatingSummary,
} from "@/features/community/contract";
import { CorrectionLink } from "@/features/corrections/CorrectionLink";
import { ReportSections } from "./ReportSections";

export function CommunityFeed({
  resortId,
  courseId,
  liftId,
  compact = false,
  hideHeading = false,
  headerActions,
}: {
  resortId: string;
  courseId?: string;
  liftId?: string;
  compact?: boolean;
  hideHeading?: boolean;
  headerActions?: ReactNode;
}) {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [ratings, setRatings] = useState<RatingSummary[]>([]);
  const [sort, setSort] = useState<"observed" | "created">("observed");
  const [kind, setKind] = useState<FeedInput["kind"]>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    setBusy(true);
    void getCommunityFeed({
      resortId,
      courseId,
      liftId,
      kind,
      from: from || undefined,
      to: to || undefined,
      sort,
    }).then(result => {
      if (!active) return;
      if (result.ok) {
        setPosts(result.data.posts);
        setRatings(result.data.ratings);
        setNextCursor(result.data.nextCursor);
      }
      setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [resortId, courseId, liftId, kind, from, to, sort]);
  const loadMore = () => {
    if (!nextCursor) return;
    void getCommunityFeed({
      resortId,
      courseId,
      liftId,
      kind,
      from: from || undefined,
      to: to || undefined,
      sort,
      cursor: nextCursor,
    }).then(result => {
      if (result.ok) {
        setPosts(all => [...all, ...result.data.posts]);
        setNextCursor(result.data.nextCursor);
      }
    });
  };
  return (
    <section className="space-y-2" aria-label="みんなの投稿">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!hideHeading && (
          <h3 className="font-semibold">
            みんなの投稿
            {(() => {
              if (liftId) return null;
              const summary = ratings.find(
                rating => rating.courseId === (courseId ?? null),
              );
              return summary ? (
                <span className="ml-2 text-xs font-normal text-gray-600">
                  ★ {summary.average.toFixed(1)} · {summary.count}人
                </span>
              ) : null;
            })()}
          </h3>
        )}
        {compact && !courseId && !liftId && (
          <CorrectionLink resortId={resortId} />
        )}
        {headerActions}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 text-xs">
          {courseId && (
            <Link
              className="rounded-md border px-2 py-1.5 font-medium whitespace-nowrap"
              href={`/community/${encodeURIComponent(resortId)}/photos?courseId=${encodeURIComponent(courseId)}`}
            >
              コースの写真
            </Link>
          )}
          {!compact && (
            <>
              <Select
                value={kind ?? ""}
                items={[
                  { value: "", label: "すべて" },
                  { value: "COURSE", label: "コースを含む" },
                  { value: "LIFT", label: "リフトを含む" },
                  { value: "MOGUL", label: "コブ" },
                  { value: "ITEM", label: "パーク" },
                ]}
                onValueChange={value =>
                  setKind((value || undefined) as FeedInput["kind"])
                }
              >
                <SelectTrigger aria-label="投稿の種類" className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">すべて</SelectItem>
                  <SelectItem value="COURSE">コースを含む</SelectItem>
                  <SelectItem value="LIFT">リフトを含む</SelectItem>
                  <SelectItem value="MOGUL">コブ</SelectItem>
                  <SelectItem value="ITEM">パーク</SelectItem>
                </SelectContent>
              </Select>
              <label className="text-xs">
                開始
                <input
                  aria-label="期間の開始日"
                  type="date"
                  className="ml-1 h-8 w-36 max-w-[calc(100vw-5rem)] rounded border px-1"
                  value={from}
                  onChange={e => setFrom(e.target.value)}
                />
              </label>
              <label className="text-xs">
                終了
                <input
                  aria-label="期間の終了日"
                  type="date"
                  className="ml-1 h-8 w-36 max-w-[calc(100vw-5rem)] rounded border px-1"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                />
              </label>
              <Select
                value={sort}
                items={[
                  { value: "observed", label: "滑走日順" },
                  { value: "created", label: "投稿日順" },
                ]}
                onValueChange={value => setSort(value as typeof sort)}
              >
                <SelectTrigger aria-label="並び順" className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="observed">滑走日順</SelectItem>
                  <SelectItem value="created">投稿日順</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <Link
            className="rounded-md border px-2 py-1.5 font-medium whitespace-nowrap"
            href={`/community/${encodeURIComponent(resortId)}`}
          >
            すべて見る
          </Link>
          <Link
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50"
            href={`/community/${encodeURIComponent(resortId)}/new${courseId ? `?courseId=${encodeURIComponent(courseId)}` : liftId ? `?liftId=${encodeURIComponent(liftId)}` : ""}`}
          >
            ＋投稿
          </Link>
        </div>
      </div>
      {busy ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-500">まだ投稿はありません。</p>
      ) : (
        <div className="space-y-2">
          {posts.slice(0, compact ? 2 : undefined).map(post => (
            <PostCard key={post.id} post={post} />
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

export function PostCard({ post }: { post: PublicPost }) {
  return (
    <article className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div className="font-semibold">
          {post.observedOn}の滑走レポート
          <span className="ml-1 text-xs font-normal text-slate-500">
            {post.resortName}
          </span>
        </div>
        <time className="text-xs text-gray-500">{post.observedOn}</time>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        <Link
          className="underline underline-offset-2"
          href={`/profile/${encodeURIComponent(post.author.id)}`}
        >
          {post.author.publicName}
        </Link>{" "}
        · ★ {post.rating ?? "—"} · ♡ {post.likeCount} · コメント{" "}
        {post.commentCount}
      </p>
      {post.body && (
        <p className="mt-2 whitespace-pre-wrap break-words">{post.body}</p>
      )}
      {post.entries.length > 0 && (
        <div className="mt-2">
          <ReportSections entries={post.entries} compact />
        </div>
      )}
      <div className="mt-2 flex gap-2 overflow-x-auto">
        {post.photos.map(photo => (
          <Link
            key={photo.id}
            href={`/community/post/${encodeURIComponent(post.id)}`}
          >
            <Image
              className="size-20 rounded object-cover"
              src={`/rusutsu/api/community/photos/${encodeURIComponent(photo.id)}`}
              alt="投稿写真"
              width={photo.width}
              height={photo.height}
              unoptimized
            />
          </Link>
        ))}
      </div>
      <Link
        className="mt-2 inline-block text-xs font-medium text-sky-800 underline"
        href={`/community/post/${encodeURIComponent(post.id)}`}
      >
        投稿の詳細
      </Link>
    </article>
  );
}
