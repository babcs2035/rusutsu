"use client";

import { type Map as MapLibreMap, Marker } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCommunityMapEntries } from "./actions";
import type { PublicMapEntry } from "./contract";
import {
  type CommunityPeriod,
  getPeriodStart,
  groupExactCoordinates,
} from "./mapOverlay";

export function CommunityMapControls({
  resortId,
  enabled,
  onEnabledChange,
}: {
  resortId: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const router = useRouter();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <label className="flex h-9 cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-1 text-sm font-semibold whitespace-nowrap text-slate-700 shadow-sm min-[375px]:px-1.5 md:h-8 md:px-1.5 md:text-[13px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={event => onEnabledChange(event.target.checked)}
          className="size-3.5 accent-blue-500"
        />
        投稿
      </label>
      <button
        type="button"
        className="h-9 rounded-md border border-slate-300 bg-white px-1 text-sm font-semibold whitespace-nowrap text-slate-700 shadow-sm hover:bg-slate-50 min-[375px]:px-1.5 md:h-8 md:px-1.5 md:text-[13px]"
        onClick={() =>
          router.push(`/community/${encodeURIComponent(resortId)}/new`)
        }
      >
        ＋投稿
      </button>
    </div>
  );
}

export function CommunityMapFilters({
  period,
  onPeriodChange,
  kind,
  onKindChange,
}: {
  period: CommunityPeriod;
  onPeriodChange: (period: CommunityPeriod) => void;
  kind: "MOGUL" | "ITEM";
  onKindChange: (kind: "MOGUL" | "ITEM") => void;
}) {
  return (
    <div
      className="flex w-full min-w-0 items-center gap-1"
      role="group"
      aria-label="地図の投稿フィルター"
    >
      <div className="min-w-0 flex-1">
        <Select
          value={period}
          items={{
            "3d": "過去3日",
            "7d": "過去1週間",
            season: "今シーズン",
            all: "全期間",
          }}
          onValueChange={value => {
            if (value) onPeriodChange(value as CommunityPeriod);
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full min-w-0 bg-white px-1.5 text-xs data-[size=sm]:h-8 md:data-[size=sm]:h-7"
            aria-label="投稿の期間"
          >
            <SelectValue className="min-w-0 truncate" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="top" align="start">
            <SelectItem value="3d">過去3日</SelectItem>
            <SelectItem value="7d">過去1週間</SelectItem>
            <SelectItem value="season">今シーズン</SelectItem>
            <SelectItem value="all">全期間</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0 flex-1">
        <Select
          value={kind}
          items={{ MOGUL: "コブ", ITEM: "パーク" }}
          onValueChange={value => {
            if (value) onKindChange(value as typeof kind);
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full min-w-0 bg-white px-1.5 text-xs data-[size=sm]:h-8 md:data-[size=sm]:h-7"
            aria-label="投稿の種類"
          >
            <SelectValue className="min-w-0 truncate" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="top" align="start">
            <SelectItem value="MOGUL">コブ</SelectItem>
            <SelectItem value="ITEM">パーク</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function CommunityMapOverlay({
  map,
  resortId,
  enabled,
  period,
  kind,
}: {
  map: MapLibreMap;
  resortId: string;
  enabled: boolean;
  period: CommunityPeriod;
  kind: "MOGUL" | "ITEM";
}) {
  const [posts, setPosts] = useState<PublicMapEntry[]>([]);
  const [overlap, setOverlap] = useState<PublicMapEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (!enabled) {
      setPosts([]);
      setOverlap(null);
      return;
    }
    let active = true;
    setLoading(true);
    const input = {
      resortId,
      from: getPeriodStart(period),
      kind,
    };
    void (async () => {
      const collected: PublicMapEntry[] = [];
      let cursor: string | undefined;
      do {
        const result = await getCommunityMapEntries({ ...input, cursor });
        if (!result.ok) throw new Error(result.error);
        collected.push(...result.data.entries);
        cursor = result.data.nextCursor ?? undefined;
      } while (cursor);
      if (active) setPosts(collected);
    })()
      .catch(() => {
        if (active) setPosts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, kind, period, resortId]);
  useEffect(() => {
    if (!enabled) return;
    const markers: Marker[] = [];
    for (const group of groupExactCoordinates(posts)) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `${group.posts.length}件の投稿`);
      button.textContent =
        group.posts.length > 1 ? String(group.posts.length) : "";
      const representative = group.posts[0];
      const color =
        representative.kind === "MOGUL"
          ? representative.present
            ? "bg-fuchsia-600"
            : "bg-slate-600"
          : representative.present
            ? "bg-amber-500"
            : "bg-slate-600";
      button.className = `flex size-5 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow ${color}`;
      if (group.posts.length > 1)
        button.className =
          "flex size-6 items-center justify-center rounded-full border-2 border-white bg-sky-700 text-[10px] font-bold text-white shadow";
      button.addEventListener("click", event => {
        event.stopPropagation();
        if (group.posts.length === 1)
          router.push(
            `/community/post/${encodeURIComponent(group.posts[0].postId)}`,
          );
        else setOverlap(group.posts);
      });
      markers.push(
        new Marker({ element: button, anchor: "center" })
          .setLngLat(group.coordinates)
          .addTo(map),
      );
    }
    return () => {
      markers.forEach(marker => {
        marker.remove();
      });
    };
  }, [enabled, map, posts, router]);
  return (
    <>
      {loading && enabled && (
        <div className="absolute top-14 left-2 z-[770] rounded bg-white/95 px-2 py-1 text-xs text-gray-600">
          投稿を読み込み中…
        </div>
      )}
      {overlap && (
        <div
          role="dialog"
          aria-label="位置が重なった投稿"
          className="absolute top-14 right-3 z-[770] max-h-[55vh] w-64 overflow-y-auto rounded-lg border bg-white p-2 shadow-xl"
        >
          <div className="mb-1 flex items-center justify-between">
            <b className="text-sm">この場所の投稿</b>
            <button
              type="button"
              className="px-2 text-lg"
              onClick={() => setOverlap(null)}
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
          {overlap.map(post => (
            <button
              type="button"
              key={post.id}
              className="block w-full border-t px-2 py-2 text-left text-xs hover:bg-slate-50"
              onClick={() =>
                router.push(
                  `/community/post/${encodeURIComponent(post.postId)}`,
                )
              }
            >
              <b>
                {post.kind === "MOGUL"
                  ? post.present
                    ? "コブあり"
                    : "コブなし"
                  : `${post.itemType ?? "パーク"} ${post.present ? "設置中" : "撤去済み"}`}
              </b>
              <span className="ml-2">{post.observedOn}</span>
              <span className="block text-gray-500">
                {post.targetName} · {post.author.publicName}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
