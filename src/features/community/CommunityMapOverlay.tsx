"use client";

import { RefreshCw } from "lucide-react";
import { type Map as MapLibreMap, Marker } from "maplibre-gl";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { CommunityMapPreview } from "./CommunityMapPreview";
import {
  communityComposerUrl,
  requestCommunityComposer,
} from "./composerEvents";
import { ENTRY_KINDS, type PublicMapEntry } from "./contract";
import { communityMapData } from "./mapData";
import {
  COMMUNITY_KIND_COLORS,
  type CommunityPeriod,
  groupMapEntries,
  type MapEntryGroup,
  resolveMapEntries,
} from "./mapOverlay";
import {
  ALL_COMMUNITY_KINDS,
  highlightCommunityMapEntry,
  openCommunityMapPosts,
  useOpenCommunityMapPosts,
} from "./mapPostStore";

export { rememberCommunityPost } from "./mapPostStore";

const PERIODS = {
  "3d": "過去3日",
  "7d": "過去1週間",
  season: "今シーズン",
  all: "全期間",
};

export function CommunityMapControls({
  resortId,
  enabled,
  available = false,
  onEnabledChange,
  error,
  onRetry,
}: {
  resortId: string;
  enabled: boolean;
  available?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  error?: string | null;
  onRetry?: () => void;
}) {
  const router = useRouter();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <label
        className={`flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-1 text-sm font-semibold whitespace-nowrap text-slate-700 shadow-sm min-[375px]:px-1.5 md:h-8 md:px-1.5 md:text-[13px] ${available ? "cursor-pointer" : "cursor-default opacity-50"}`}
      >
        <input
          type="checkbox"
          checked={enabled && available}
          disabled={!available}
          onChange={event => onEnabledChange(event.target.checked)}
          className="size-3.5 accent-blue-500"
        />
        投稿
      </label>
      {error && onRetry && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-7 shrink-0"
          aria-label="投稿の読み込みを再試行"
          title="投稿を読み込めませんでした。再試行"
          onClick={onRetry}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-9 rounded-md border border-slate-300 bg-white px-1 text-sm font-semibold whitespace-nowrap text-slate-700 shadow-sm hover:bg-slate-50 min-[375px]:px-1.5 md:h-8 md:px-1.5 md:text-[13px]"
        onClick={() => {
          const request = { resortId };
          if (!requestCommunityComposer(request))
            router.push(communityComposerUrl(request));
        }}
      >
        ＋投稿
      </Button>
    </div>
  );
}

export function CommunityMapFilters({
  period,
  onPeriodChange,
  kinds,
  onKindsChange,
  count,
  loading,
  error,
  onRetry,
  latestObservedOn,
  settings,
  periodCount,
}: {
  period: CommunityPeriod;
  onPeriodChange: (period: CommunityPeriod) => void;
  kinds: PublicMapEntry["kind"][];
  onKindsChange: (kinds: PublicMapEntry["kind"][]) => void;
  count: number;
  periodCount: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  latestObservedOn: string | null;
  settings: ReactNode;
}) {
  const chipClass =
    "h-8 min-w-0 flex-1 rounded-md px-1 text-xs font-semibold whitespace-nowrap md:text-sm";
  return (
    <div
      className="flex w-full min-w-0 flex-col gap-1"
      role="group"
      aria-label="地図の投稿フィルター"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-xs font-semibold whitespace-nowrap text-slate-600 md:text-sm">
          滑走日
        </span>
        <Select
          value={period}
          items={PERIODS}
          onValueChange={value => {
            if (value) onPeriodChange(value as CommunityPeriod);
          }}
        >
          <SelectTrigger
            size="sm"
            className="min-w-0 flex-1 bg-white px-2 text-xs data-[size=sm]:h-8 md:text-sm"
            aria-label="投稿の期間"
          >
            <SelectValue className="min-w-0 truncate" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="top" align="start">
            {Object.entries(PERIODS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          role="status"
          className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-slate-600 tabular-nums md:text-sm"
        >
          {loading && <Spinner className="size-3" />}
          {count}件{loading ? "…" : ""}
        </span>
        {settings}
      </div>
      <div
        className="flex min-w-0 items-center gap-1"
        role="group"
        aria-label="投稿の種類"
      >
        <span className="mr-1 shrink-0 text-xs font-semibold whitespace-nowrap text-slate-600 md:text-sm">
          表示項目
        </span>
        {ALL_COMMUNITY_KINDS.map(kind => (
          <Button
            key={kind}
            variant="outline"
            className={chipClass}
            style={{
              borderColor: COMMUNITY_KIND_COLORS[kind],
              backgroundColor: kinds.includes(kind)
                ? COMMUNITY_KIND_COLORS[kind]
                : undefined,
              color: kinds.includes(kind)
                ? "white"
                : COMMUNITY_KIND_COLORS[kind],
            }}
            aria-pressed={kinds.includes(kind)}
            onClick={() =>
              onKindsChange(
                kinds.includes(kind)
                  ? kinds.filter(value => value !== kind)
                  : [...kinds, kind],
              )
            }
          >
            {ENTRY_KINDS[kind]}
          </Button>
        ))}
      </div>
      {error ? (
        <div
          className="flex items-center justify-between gap-1 text-xs text-slate-600"
          role="alert"
        >
          <span>{error}</span>
          <Button variant="outline" size="xs" onClick={onRetry}>
            再試行
          </Button>
        </div>
      ) : !loading && count === 0 ? (
        <div
          className="flex items-center justify-between gap-1 text-xs text-slate-600"
          role="status"
        >
          <span>
            {kinds.length === 0
              ? "表示する項目を選んでください"
              : periodCount > 0
                ? "選択中の項目は0件です"
                : "この期間の投稿は0件です"}
          </span>
          {periodCount === 0 && kinds.length > 0 && period !== "all" && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => onPeriodChange("all")}
            >
              期間を広げる
            </Button>
          )}
        </div>
      ) : (period === "all" || period === "season") && latestObservedOn ? (
        <p className="text-xs text-slate-500">
          最新の滑走日：{latestObservedOn.replaceAll("-", "/")}
        </p>
      ) : null}
    </div>
  );
}

/** 投稿の写真・点。コース名などのラベル（同じ地図のマーカー）より必ず上に出す。 */
const MARKER_Z_INDEX = "5";

/** 投稿を表す点。複数あれば件数を中に書く。 */
export function communityDotElement(color: string, count = 1) {
  const element = document.createElement("span");
  element.className =
    "flex items-center justify-center rounded-full text-[11px] leading-none font-bold text-white shadow-md";
  const size = count > 1 ? "24px" : "18px";
  element.style.width = size;
  element.style.height = size;
  element.style.border = "2px solid white";
  element.style.backgroundColor = color;
  if (count > 1) element.textContent = String(count);
  return element;
}

/**
 * 位置情報のない投稿と写真のない投稿は点にする。
 * 開いている投稿も、写真は下のプレビューに出るので点にする。
 */
function setMarkerContent(
  button: HTMLButtonElement,
  group: MapEntryGroup,
  opened: boolean,
) {
  const primary =
    group.posts.find(post => post.entry.photo && !post.targetOnly) ??
    group.posts[0];
  const { entry, targetOnly } = primary;
  const count = group.posts.length;
  const color = group.posts.every(post => post.entry.kind === entry.kind)
    ? COMMUNITY_KIND_COLORS[entry.kind]
    : "#334155";
  const setDot = () => {
    button.className =
      "rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-600";
    button.style.border = "";
    button.replaceChildren(communityDotElement(color, count));
  };
  if (opened || !entry.photo || targetOnly) {
    setDot();
    return;
  }
  button.className =
    "relative flex rounded-md bg-white shadow-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-600";
  button.style.border = `3px solid ${COMMUNITY_KIND_COLORS[entry.kind]}`;
  const image = document.createElement("img");
  image.src = `/rusutsu/api/community/photos/${encodeURIComponent(entry.photo.id)}?size=map`;
  image.alt = "";
  image.width = 40;
  image.height = 40;
  image.decoding = "async";
  image.className = "size-10 rounded-[3px] object-cover";
  image.addEventListener("error", setDot, { once: true });
  button.replaceChildren(image);
  if (count > 1 || entry.photoCount > 1) {
    const badge = document.createElement("span");
    badge.className =
      "absolute -top-2 -right-2 min-w-5 rounded-full border border-white px-1 text-center text-[11px] leading-[18px] font-bold text-white";
    badge.textContent = count > 1 ? String(count) : `＋${entry.photoCount - 1}`;
    badge.style.backgroundColor = count > 1 ? color : "rgba(0,0,0,0.65)";
    button.append(badge);
  }
}

function markerElement(
  group: MapEntryGroup,
  opened: boolean,
  onClick: () => void,
) {
  const { entry, targetOnly } = group.posts[0];
  const count = group.posts.length;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.communityMarker = "true";
  button.setAttribute(
    "aria-label",
    `${entry.targetName}・${ENTRY_KINDS[entry.kind]}・${count}件の投稿`,
  );
  button.title = `${entry.targetName} · 滑走日 ${entry.observedOn}${targetOnly ? " · 対象全体の投稿" : ""}`;
  button.style.zIndex = MARKER_Z_INDEX;
  setMarkerContent(button, group, opened);
  button.addEventListener("click", event => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

export function CommunityMapOverlay({
  map,
  resortId,
  enabled,
  posts,
  mapData,
  filterKey,
}: {
  map: MapLibreMap;
  resortId: string;
  enabled: boolean;
  posts: PublicMapEntry[];
  mapData: FinalizedResortMapData | null;
  filterKey: string;
}) {
  const { open, hosted } = useOpenCommunityMapPosts(resortId);
  const markersRef = useRef(
    new Map<string, { marker: Marker; group: MapEntryGroup }>(),
  );
  const openKeyRef = useRef<string | null>(null);
  const [previewSize, setPreviewSize] = useState({ height: 320, small: false });
  useEffect(() => {
    const updateSize = () => {
      const canvas = map.getCanvas();
      const panel = canvas
        .closest("[data-map-presentation]")
        ?.querySelector("[data-map-bottom-panel]");
      const toolbarHeight = panel?.getBoundingClientRect().height ?? 48;
      const small = canvas.clientHeight < 320;
      setPreviewSize({
        small,
        height: Math.max(
          134,
          Math.min(
            window.innerHeight * 0.5,
            canvas.clientHeight - toolbarHeight - (small ? 24 : 72),
          ),
        ),
      });
    };
    updateSize();
    map.on("resize", updateSize);
    const observer = new ResizeObserver(updateSize);
    observer.observe(map.getContainer());
    return () => {
      map.off("resize", updateSize);
      observer.disconnect();
    };
  }, [map]);
  const resolved = useMemo(
    () => resolveMapEntries(posts, communityMapData("", [0, 0], mapData)),
    [posts, mapData],
  );
  const close = useCallback(
    () => openCommunityMapPosts(resortId, null),
    [resortId],
  );
  // フィルターの変更・レイヤー終了時だけ閉じ、後続ページの到着や
  // 地図の作り直し（スマホで詳細を開くと地図が縮む）では閉じない。
  const previousFilterKey = useRef(filterKey);
  useEffect(() => {
    if (previousFilterKey.current !== filterKey || !enabled) close();
    previousFilterKey.current = filterKey;
  }, [close, enabled, filterKey]);
  useEffect(() => {
    if (!enabled) return;
    const markers = markersRef.current;
    const render = () => {
      const canvas = map.getCanvas();
      const groups = groupMapEntries(
        resolved,
        point => map.project(point),
        { width: canvas.clientWidth, height: canvas.clientHeight },
        80,
      );
      const keys = new Set(groups.map(group => group.key));
      for (const [key, { marker }] of markers)
        if (!keys.has(key)) {
          marker.remove();
          markers.delete(key);
        }
      for (const group of groups) {
        if (markers.has(group.key)) continue;
        const opened = group.key === openKeyRef.current;
        const element = markerElement(group, opened, () => {
          openCommunityMapPosts(resortId, {
            key: group.key,
            posts: group.posts.map(post => post.entry),
          });
          if (group.posts.length === 1)
            highlightCommunityMapEntry(resortId, group.posts[0].entry);
        });
        markers.set(group.key, {
          group,
          marker: new Marker({ element, anchor: "center" })
            .setLngLat(group.coordinates)
            .addTo(map),
        });
      }
    };
    render();
    map.on("moveend", render);
    map.on("resize", render);
    map.on("click", close);
    return () => {
      map.off("moveend", render);
      map.off("resize", render);
      map.off("click", close);
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
    };
  }, [enabled, map, resolved, close, resortId]);
  // 開いた投稿だけ写真をやめて点にし、閉じたら写真に戻す。
  const openKey = open?.key ?? null;
  useEffect(() => {
    const previous = openKeyRef.current;
    openKeyRef.current = openKey;
    for (const key of [previous, openKey]) {
      const item = key ? markersRef.current.get(key) : undefined;
      if (item)
        setMarkerContent(
          item.marker.getElement() as HTMLButtonElement,
          item.group,
          key === openKey,
        );
    }
  }, [openKey]);
  // スキー場詳細が出ていれば、そちらがコース詳細と同じ場所に出す
  if (!enabled || !open || hosted) return null;
  return (
    <div
      className={
        previewSize.small
          ? "absolute top-2 left-12 z-[770] max-w-[calc(100%-3.5rem)]"
          : "absolute top-14 left-2 z-[770] max-w-[calc(100%-1rem)]"
      }
    >
      <CommunityMapPreview
        key={open.key}
        posts={open.posts}
        onSelect={entry => highlightCommunityMapEntry(resortId, entry)}
        onClose={close}
        className="w-[min(320px,calc(100vw-1.5rem))] max-w-full rounded-lg border shadow-xl"
        style={{ maxHeight: previewSize.height }}
      />
    </div>
  );
}
