"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DetailButton } from "@/shared/components/DetailButton";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import {
  type ActionResult,
  ENTRY_KINDS,
  type PublicMapEntry,
  type PublicPost,
} from "./contract";
import { COMMUNITY_KIND_COLORS } from "./mapOverlay";
import { ReportSections } from "./ReportSections";

type PreviewDetail = { post: PublicPost };

export function CommunityMapPreview({
  posts,
  onSelect,
  onClose,
  maxHeight = 400,
}: {
  posts: PublicMapEntry[];
  onSelect: (entry: PublicMapEntry) => void;
  onClose: () => void;
  maxHeight?: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PublicMapEntry | null>(null);
  const [detail, setDetail] = useState<PreviewDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const effectiveSelected = selected ?? (posts.length === 1 ? posts[0] : null);
  const selectedEntryId = effectiveSelected?.id;
  const fetchKey = effectiveSelected
    ? `${effectiveSelected.postId}#${retryKey}`
    : null;
  const showingList = posts.length > 1 && selected === null;

  useEffect(() => {
    if (!fetchKey || !selectedEntryId) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setDetail(null);
    setError(null);
    setLoading(true);
    void fetch(
      `/rusutsu/api/community/map?postId=${encodeURIComponent(fetchKey.slice(0, fetchKey.lastIndexOf("#")))}`,
      { cache: "no-store" },
    )
      .then(response => {
        if (!response.ok) throw new Error("投稿を読み込めませんでした。");
        return response.json() as Promise<ActionResult<PreviewDetail>>;
      })
      .then(result => {
        if (!active) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (
          !result.data.post.entries.some(entry => entry.id === selectedEntryId)
        ) {
          setError("投稿内容が見つかりませんでした。");
          return;
        }
        setDetail(result.data);
      })
      .catch(() => {
        if (active) setError("投稿を読み込めませんでした。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchKey, selectedEntryId]);

  const choose = (entry: PublicMapEntry) => {
    setSelected(entry);
    onSelect(entry);
  };
  const backToList = () => {
    setSelected(null);
    setDetail(null);
    setError(null);
  };
  const activePost = detail?.post;
  const matchingEntry = activePost?.entries.find(
    entry => entry.id === effectiveSelected?.id,
  );
  const targetOnly =
    effectiveSelected &&
    (effectiveSelected.kind === "COURSE" ||
      effectiveSelected.kind === "LIFT") &&
    effectiveSelected.latitude === null &&
    effectiveSelected.longitude === null;

  return (
    <section
      role="dialog"
      aria-label="地図の投稿"
      className="flex w-[min(320px,calc(100vw-1.5rem))] max-w-full min-w-0 flex-col overflow-hidden rounded-lg border bg-white shadow-xl"
      style={{ maxHeight }}
    >
      <header className="flex shrink-0 min-w-0 items-center gap-1 border-b px-2 py-1.5">
        {selected && posts.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            aria-label="投稿一覧に戻る"
            onClick={backToList}
          >
            ‹
          </Button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {showingList ? "この場所の投稿" : "現地レポート"}
        </h2>
        {!showingList && effectiveSelected && (
          <DetailButton
            compact
            aria-label="投稿の詳細を開く"
            onClick={() =>
              router.push(
                `/community/post/${encodeURIComponent(effectiveSelected.postId)}`,
              )
            }
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7 shrink-0 md:size-8"
          aria-label="閉じる"
          onClick={onClose}
        >
          <X className="size-[18px]" strokeWidth={2.5} />
        </Button>
      </header>

      {showingList ? (
        <div className="min-h-0 overflow-y-auto">
          {posts.map(entry => (
            <button
              type="button"
              key={entry.id}
              className="flex w-full min-w-0 items-center gap-2 border-b px-2 py-2 text-left last:border-b-0 hover:bg-slate-50"
              onClick={() => choose(entry)}
            >
              {entry.photo && (
                <Image
                  className="size-10 shrink-0 rounded border-2 object-cover"
                  style={{ borderColor: COMMUNITY_KIND_COLORS[entry.kind] }}
                  src={`/rusutsu/api/community/photos/${encodeURIComponent(entry.photo.id)}?size=thumb`}
                  alt=""
                  width={entry.photo.width}
                  height={entry.photo.height}
                  unoptimized
                />
              )}
              {!entry.photo && (
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: COMMUNITY_KIND_COLORS[entry.kind] }}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-800">
                  {ENTRY_KINDS[entry.kind]}・{entry.targetName}
                  {(entry.kind === "COURSE" || entry.kind === "LIFT") &&
                  entry.latitude === null &&
                  entry.longitude === null
                    ? "・全体"
                    : ""}
                  {entry.photoCount > 1 && ` · 写真${entry.photoCount}枚`}
                </span>
                <span className="block text-xs text-slate-500">
                  {entry.observedOn}
                </span>
              </span>
              <span className="shrink-0 text-slate-400" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="min-h-0 min-w-0 overflow-y-auto p-2">
          {effectiveSelected && loading && (
            <LoadingSpinner
              text="読み込み中…"
              className="min-h-24 bg-white [&_svg]:size-8 [&_p]:text-xs"
            />
          )}
          {effectiveSelected && error && !loading && (
            <div className="flex min-h-24 flex-col items-center justify-center gap-2 text-center">
              <p className="text-xs text-slate-600">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRetryKey(value => value + 1)}
              >
                再試行
              </Button>
            </div>
          )}
          {effectiveSelected && activePost && !loading && !error && (
            <div className="space-y-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-800">
                  {targetOnly
                    ? effectiveSelected.kind === "COURSE"
                      ? "コース全体"
                      : "リフト全体"
                    : effectiveSelected.targetName}
                </p>
                <p className="text-xs text-slate-500">
                  {activePost.author.publicName} · 滑走日時{" "}
                  {activePost.observedOn} {activePost.observedTime}
                </p>
              </div>
              {matchingEntry && (
                <ReportSections entries={[matchingEntry]} bare />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
