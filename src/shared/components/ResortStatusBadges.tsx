"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ResortStatusKind =
  | "confirmed"
  | "osm"
  | "liftData"
  | "crawler"
  | "noCrawler"
  | "draft"
  | "unknownId";

const STYLES: Record<
  ResortStatusKind,
  { label: string; className: string; title: string }
> = {
  confirmed: {
    label: "✓ 確認済み",
    className: "bg-green-50 text-green-900",
    title: "人の目で確認したデータがあります",
  },
  osm: {
    label: "OSM・未確認",
    className: "bg-orange-50 text-orange-900",
    title: "OpenStreetMap 由来のデータだけがあり、まだ確認していません",
  },
  liftData: {
    label: "リフトデータあり",
    className: "bg-blue-50 text-blue-900",
    title: "lift_before があります",
  },
  crawler: {
    label: "クローラーあり",
    className: "bg-sky-50 text-sky-900",
    title: "公式サイトから営業情報を取得できています",
  },
  noCrawler: {
    label: "クローラーなし",
    className: "bg-gray-100 text-gray-600",
    title:
      "営業情報を取得できていません（クローラー自体が無い場合と、あっても取得できていない場合の両方を含みます）",
  },
  draft: {
    label: "下書きあり",
    className: "bg-orange-50 text-orange-900",
    title: "このブラウザに保存された編集途中のデータがあります",
  },
  unknownId: {
    label: "未登録ID",
    className: "bg-gray-100 text-gray-600",
    title: "DB のスキー場一覧には無い ID です",
  },
};

export function ResortStatusBadge({
  kind,
  className,
}: {
  kind: ResortStatusKind;
  className?: string;
}) {
  const style = STYLES[kind];
  return (
    <Badge
      variant="secondary"
      title={style.title}
      className={cn("shrink-0 text-[10px]", style.className, className)}
    >
      {style.label}
    </Badge>
  );
}

/** 一覧に出るバッジの意味を並べた凡例 */
export function ResortStatusLegend({ kinds }: { kinds: ResortStatusKind[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {kinds.map(kind => (
        <span key={kind} className="flex items-center gap-1">
          <ResortStatusBadge kind={kind} />
          <span className="text-[10px] text-gray-500">
            {STYLES[kind].title}
          </span>
        </span>
      ))}
    </div>
  );
}
