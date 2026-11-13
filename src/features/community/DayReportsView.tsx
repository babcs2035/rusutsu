"use client";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ResortFinalizedMap } from "@/features/map/components/ResortFinalizedMap";
import useMediaQuery from "@/hooks/use-media-query";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { SegmentedControl } from "@/shared/components/SegmentedControl";
import type { MapSkiResort } from "@/types/skiResorts";
import { communityComposerUrl } from "./composerEvents";
import {
  type DayReports,
  ENTRY_KINDS,
  type PublicMapEntry,
  type PublicPost,
  type PublicReportEntry,
} from "./contract";
import {
  dayResorts,
  dayShareText,
  entrySummary,
  formatObservedOn,
} from "./dayShare";
import { communityMapData } from "./mapData";
import { COMMUNITY_KIND_COLORS, resolveMapEntries } from "./mapOverlay";
import {
  highlightCommunityMapEntry,
  openCommunityMapPosts,
  useCommunityMapPostHost,
  useOpenCommunityMapPosts,
} from "./mapPostStore";
import { PostReactions } from "./PostReactions";
import { PostReportButton } from "./PostReportButton";
import { ReportSections } from "./ReportSections";
import { ShareDayButton } from "./ShareDayButton";

const DynamicMap = dynamic(
  () =>
    import("@/features/map/MapLibreResortMap").then(m => m.MapLibreResortMap),
  {
    ssr: false,
    loading: () => <LoadingSpinner text="地図を読み込み中…" />,
  },
);
const nothing = () => undefined;

export type DayReportMap = {
  resort: MapSkiResort;
  mapData: FinalizedResortMapData | null;
};

/** 地図の印に使う形。投稿1件は1項目なので、その項目の場所と写真を使う。 */
function toMapEntry(post: PublicPost): PublicMapEntry | null {
  const entry = post.entries[0];
  if (!entry) return null;
  return {
    id: entry.id,
    postId: post.id,
    kind: entry.kind,
    observedOn: post.observedOn,
    latitude: entry.latitude,
    longitude: entry.longitude,
    courseId: entry.courseId,
    liftId: entry.liftId,
    targetName: entry.targetName,
    photo: entry.photos[0] ?? null,
    photoCount: entry.photos.length,
  };
}

/** 種類は別に書くので、ここは対象の名前だけ。コブは場所のコース、パークはアイテムとコース。 */
function entryName(entry: PublicReportEntry) {
  if (entry.kind === "COURSE" || entry.kind === "LIFT") return entry.targetName;
  return [
    entry.itemType,
    entry.targetName !== ENTRY_KINDS[entry.kind] ? entry.targetName : null,
  ]
    .filter(Boolean)
    .join("・");
}

/**
 * 1人が1日（滑走日）に投稿した現地レポートのページ。SNSで共有したリンクの行き先。
 * スマホは上に地図・下に投稿、PCは左に地図・右に投稿を並べる。
 * 投稿を押すと中身を開き、地図でその場所を示す。地図の印を押しても同じ投稿が開く。
 */
export function DayReportsView({
  data,
  maps,
  initialPostId,
}: {
  data: DayReports;
  /** 投稿のあるスキー場ごとの地図。投稿の多い順 */
  maps: DayReportMap[];
  /** 最初から開いておく投稿（1件の投稿へのリンクから来たとき） */
  initialPostId?: string;
}) {
  const [isDesktop] = useMediaQuery("(min-width: 768px)");
  const resorts = useMemo(
    () =>
      dayResorts(data.posts).filter(resort =>
        maps.some(map => map.resort.id === resort.id),
      ),
    [data.posts, maps],
  );
  const initialPost = data.posts.find(post => post.id === initialPostId);
  const [resortId, setResortId] = useState(
    resorts.find(resort => resort.id === initialPost?.resortId)?.id ??
      resorts[0].id,
  );
  const current = maps.find(map => map.resort.id === resortId) ?? maps[0];
  const mapResorts = useMemo(() => [current.resort], [current.resort]);
  const posts = useMemo(
    () => data.posts.filter(post => post.resortId === resortId),
    [data.posts, resortId],
  );
  const mapEntries = useMemo(
    () =>
      posts
        .map(toMapEntry)
        .filter((entry): entry is PublicMapEntry => entry !== null),
    [posts],
  );

  // 選んだ投稿は、地図の印を押したときと同じ置き場所で持つ。
  // 地図の何もない所を押すと地図側が閉じるので、一覧の選択も一緒に外れる。
  useCommunityMapPostHost(resortId, true);
  const { open } = useOpenCommunityMapPosts(resortId);
  const selected = open
    ? posts.find(post => open.posts.some(entry => entry.postId === post.id))
    : undefined;
  const select = useCallback(
    (post: PublicPost | null) => {
      const entry = post ? toMapEntry(post) : null;
      if (!post || !entry) {
        openCommunityMapPosts(resortId, null);
        return;
      }
      openCommunityMapPosts(resortId, {
        key: `day:${post.id}`,
        posts: [entry],
      });
      highlightCommunityMapEntry(resortId, entry);
    },
    [resortId],
  );
  // 印に複数の投稿がまとまっているときは、一覧で先頭になる投稿を地図で示す
  const openCount = open?.posts.length ?? 0;
  const selectedId = selected?.id;
  useEffect(() => {
    if (openCount < 2 || !selectedId) return;
    const entry = mapEntries.find(item => item.postId === selectedId);
    if (entry) highlightCommunityMapEntry(resortId, entry);
  }, [openCount, selectedId, mapEntries, resortId]);
  // ページを離れたら、同じスキー場の別の地図に選択を残さない
  useEffect(() => () => openCommunityMapPosts(resortId, null), [resortId]);

  // 地図の印から選んだときも、その投稿が見える位置まで一覧を送る
  const rows = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (selectedId)
      rows.current
        .get(selectedId)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  // 開いたときは、この日の投稿がすべて入る範囲まで地図を寄せる（スキー場全体だと印が重なる）。
  // リンクで指定された投稿があれば、地図の用意ができてからその投稿を開く。
  // 寄せるのはスキー場ごとに1回だけ。リアクションの保存などで描き直しても動かさない。
  const pendingInitial = useRef(initialPost);
  const fittedResortId = useRef<string | null>(null);
  const handleMapReady = useCallback(
    (map: MapLibreMap) => {
      if (fittedResortId.current === resortId) return;
      fittedResortId.current = resortId;
      const post = pendingInitial.current;
      pendingInitial.current = undefined;
      if (post) {
        setTimeout(() => select(post), 0);
        return;
      }
      const points = resolveMapEntries(
        mapEntries,
        communityMapData("", [0, 0], current.mapData),
      ).map(item => item.coordinates);
      if (!points.length) return;
      const lngs = points.map(point => point[0]);
      const lats = points.map(point => point[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        {
          // 下は縮尺と出典、PCはさらに色分けの切り替えと凡例のぶんを空ける
          padding: {
            top: 56,
            left: 56,
            right: 56,
            bottom: isDesktop ? 150 : 72,
          },
          maxZoom: 15,
          bearing: map.getBearing(),
          animate: false,
        },
      );
    },
    [select, mapEntries, current.mapData, isDesktop, resortId],
  );

  const author = data.author;
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,42dvh)_minmax(0,1fr)] bg-white md:grid-cols-[minmax(0,1fr)_var(--desktop-detail-panel-width)] md:grid-rows-[auto_minmax(0,1fr)]">
      <header className="min-w-0 border-b border-gray-200 py-2 pr-2 pl-3 md:col-start-2 md:row-start-1 md:border-l md:pr-3 md:pl-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="min-w-0 text-lg leading-snug font-bold text-gray-900 font-[var(--font-heading)]">
              <Link
                href={`/${current.resort.id}`}
                className="flex min-w-0 items-center hover:underline"
              >
                <span className="truncate">{current.resort.nameJa}</span>
                <ChevronRight
                  className="size-4 shrink-0 text-gray-400"
                  aria-hidden="true"
                />
              </Link>
            </h1>
            <p className="truncate text-xs text-gray-500">
              {/* 狭い幅で切れるのは末尾なので、日付と件数を先に書く */}
              {formatObservedOn(data.observedOn)} {data.posts.length}件
              <span className="mx-1 text-gray-300">|</span>
              <Link
                href={`/profile/${encodeURIComponent(author.id)}`}
                className="font-semibold text-gray-700 hover:underline"
              >
                {author.publicName}
              </Link>
              さんの現地レポート
            </p>
          </div>
          <ShareDayButton
            authorId={author.id}
            observedOn={data.observedOn}
            text={dayShareText(data.posts, data.observedOn)}
          />
        </div>
        {resorts.length > 1 && (
          // 1日に複数のスキー場を滑った日だけ、スキー場を切り替える
          <SegmentedControl
            className="mt-1.5 w-full overflow-x-auto"
            itemClassName="h-7 flex-1 px-2 text-xs"
            options={resorts.map(resort => ({
              value: resort.id,
              label: `${resort.name} ${resort.count}件`,
            }))}
            value={resortId}
            onChange={next => {
              openCommunityMapPosts(resortId, null);
              setResortId(next);
            }}
          />
        )}
      </header>

      <div className="relative min-h-0 border-b border-gray-200 bg-gray-100 md:col-start-1 md:row-span-2 md:row-start-1 md:border-b-0">
        <ResortFinalizedMap
          DynamicMap={DynamicMap}
          resortId={resortId}
          finalizedMapData={current.mapData}
          mapResorts={mapResorts}
          presentation="expanded"
          // スマホは地図が低いので、色分けの切り替えと凡例は出さない
          showToolbar={isDesktop}
          showOpenOnlyControl={false}
          showLocationControl={false}
          compactControls={!isDesktop}
          communityEntries={mapEntries}
          selectedFinalizedFeature={null}
          selectedElevationProfilePoint={null}
          onSelectedFinalizedFeatureChange={nothing}
          onSelectedElevationProfilePointChange={nothing}
          onMapReady={handleMapReady}
        />
      </div>

      <div
        // 写真の拡大表示を、PCではこのパネルの範囲に重ねる
        data-ski-resort-detail-panel="true"
        className="min-h-0 overflow-y-auto overscroll-contain p-3 md:col-start-2 md:row-start-2 md:border-l md:border-gray-200 @container/resort-detail"
      >
        <ol className="space-y-2" aria-label="この日の投稿">
          {posts.map(post => {
            const entry = post.entries[0];
            if (!entry) return null;
            const isSelected = post.id === selectedId;
            const summary = entrySummary(entry);
            return (
              <li
                key={post.id}
                ref={element => {
                  if (element) rows.current.set(post.id, element);
                  else rows.current.delete(post.id);
                }}
                className={cn(
                  "scroll-my-2 rounded-lg border px-3 py-2 text-sm",
                  isSelected
                    ? "border-blue-600 ring-1 ring-blue-600"
                    : "border-gray-200",
                )}
              >
                <button
                  type="button"
                  aria-expanded={isSelected}
                  className="flex w-full min-w-0 items-center gap-2 text-left"
                  onClick={() => select(isSelected ? null : post)}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: COMMUNITY_KIND_COLORS[entry.kind],
                    }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <time className="shrink-0 text-xs text-gray-500 tabular-nums">
                        {post.observedTime}
                      </time>
                      <span className="shrink-0 text-xs font-medium text-slate-500">
                        {ENTRY_KINDS[entry.kind]}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 text-sm font-semibold text-slate-800",
                          !isSelected && "truncate",
                        )}
                      >
                        {entryName(entry)}
                      </span>
                    </span>
                    {!isSelected && summary && (
                      <span className="block truncate text-xs text-slate-600">
                        {summary}
                      </span>
                    )}
                  </span>
                  {!isSelected && entry.photos[0] && (
                    <Image
                      className="size-10 shrink-0 rounded object-cover"
                      src={`/rusutsu/api/community/photos/${encodeURIComponent(entry.photos[0].id)}?size=thumb`}
                      alt=""
                      width={entry.photos[0].width}
                      height={entry.photos[0].height}
                      unoptimized
                    />
                  )}
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-slate-400",
                      isSelected && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isSelected && (
                  <div className="mt-1.5">
                    <ReportSections entries={post.entries} bare hideTitle />
                    <PostReactions
                      post={post}
                      showPostedAt={false}
                      trailing={<PostReportButton postId={post.id} />}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={`/${current.resort.id}`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-8 gap-0.5 px-2.5 text-xs font-semibold",
            )}
          >
            スキー場の詳細を見る
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
          <Link
            href={communityComposerUrl({ resortId: current.resort.id })}
            className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md bg-blue-600 px-2 text-xs font-bold whitespace-nowrap text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="size-3.5" strokeWidth={3} />
            投稿
          </Link>
          {data.viewerId === author.id && (
            <Link
              href="/account/posts"
              className="ml-auto text-xs font-medium whitespace-nowrap text-sky-800 underline"
            >
              自分の投稿を管理
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
