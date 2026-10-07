"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { getSkiResortById } from "@/actions/skiResorts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResortFinalizedMap } from "@/features/map/components/ResortFinalizedMap";
import { readDetailCache } from "@/features/map/session/detailCache";
import type { SelectedMapFeature } from "@/features/map/types";
import { ElevationProfile } from "@/features/resort-detail/components/ElevationProfile";
import { FeatureTags } from "@/features/resort-detail/components/FeatureHeadline";
import type {
  ElevationProfilePoint,
  FinalizedCourseGroup,
} from "@/features/resort-detail/types";
import {
  createConnectedCourseElevationProfile,
  createFinalizedCourseGroups,
  findSelectedCourseGroup,
  getCourseGroupTags,
} from "@/features/resort-detail/utils/detailMetrics";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import type { CourseRecommendation } from "@/server/course-recommendations/repository";
import { recommendationGrade, recommendationSelection } from "./algorithm";
import { comparisonScoreRows, comparisonSourceGroup } from "./comparison";

const TEXT_TAB_CLASS =
  "-mb-px min-h-10 flex-none rounded-none border-0 border-b-2 border-transparent px-0 py-2 text-sm font-normal text-slate-500 shadow-none after:hidden data-active:border-slate-900 data-active:text-slate-900";

const DynamicMap = dynamic(
  () =>
    import("@/features/map/MapLibreResortMap").then(
      module => module.MapLibreResortMap,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="p-3 text-xs text-slate-500">地図を読み込み中…</p>
    ),
  },
);
const NOOP = () => undefined;
const MAP_RESORTS: [] = [];

function CourseMap({
  mapData,
  resortId,
  selection,
}: {
  mapData: FinalizedResortMapData;
  resortId: string;
  selection: SelectedMapFeature;
}) {
  return (
    <div className="isolate h-60 overflow-hidden rounded-lg border border-slate-200 md:h-80">
      <ResortFinalizedMap
        DynamicMap={DynamicMap}
        resortId={resortId}
        finalizedMapData={mapData}
        mapResorts={MAP_RESORTS}
        presentation="expanded"
        showToolbar={false}
        showContextLabels
        selectedFinalizedFeature={selection}
        selectedElevationProfilePoint={null}
        onSelectedFinalizedFeatureChange={NOOP}
        onSelectedElevationProfilePointChange={NOOP}
        courseColorMode="slope"
      />
    </div>
  );
}

/** 地図と断面図を1組にした1コース分。PCは横並び、スマホは切り替え */
function CourseRow({
  label,
  resortName,
  group,
  resortId,
  mapData,
  selection,
  mobileView,
}: {
  label: string;
  resortName: string;
  group: FinalizedCourseGroup | null;
  resortId: string;
  mapData: FinalizedResortMapData | null;
  selection: SelectedMapFeature;
  mobileView: "map" | "profile";
}) {
  return (
    <section className="min-w-0" aria-label={`${label}のコース`}>
      <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="shrink-0 text-xs text-slate-500">
          {label}・{resortName}
        </span>
        <h3 className="min-w-0 break-words text-sm font-bold text-slate-900">
          {group?.displayName ?? ""}
        </h3>
        {group && <FeatureTags {...getCourseGroupTags(group)} />}
      </div>
      {group && mapData ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className={mobileView === "map" ? "" : "hidden md:block"}>
            <CourseMap
              mapData={mapData}
              resortId={resortId}
              selection={selection}
            />
          </div>
          <div className={mobileView === "profile" ? "" : "hidden md:block"}>
            <CourseProfile group={group} />
          </div>
        </div>
      ) : (
        <TargetState error={false} onRetry={NOOP} />
      )}
    </section>
  );
}

function CourseProfile({ group }: { group: FinalizedCourseGroup }) {
  const points = useMemo(
    () => createConnectedCourseElevationProfile(group.courses),
    [group],
  );
  const [point, setPoint] = useState<ElevationProfilePoint | null>(null);
  return points.length >= 2 ? (
    <ElevationProfile
      points={points}
      activeDistance={point?.distance}
      onPointSelect={setPoint}
    />
  ) : (
    <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
      断面図のデータがありません。
    </p>
  );
}

export function CourseComparisonDialog({
  resortId,
  resortName,
  courseGroup,
  candidate,
  onClose,
}: {
  resortId: string;
  resortName: string;
  courseGroup: FinalizedCourseGroup;
  candidate: CourseRecommendation;
  onClose: () => void;
}) {
  const source = useMemo(
    () => comparisonSourceGroup(courseGroup),
    [courseGroup],
  );
  const [target, setTarget] = useState<{
    group: FinalizedCourseGroup;
    mapData: FinalizedResortMapData;
  } | null>(null);
  const [sourceMap, setSourceMap] = useState<FinalizedResortMapData | null>(
    null,
  );
  const [mobileView, setMobileView] = useState<"map" | "profile">("map");
  const sourceSelection = useMemo<SelectedMapFeature>(
    () =>
      recommendationSelection(courseGroup.id, courseGroup.courses) ?? {
        kind: "course",
        id: courseGroup.id,
      },
    [courseGroup],
  );
  // 選択中のコースは、周りのコース・リフトも出すためにスキー場全体の地図を使う
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const data =
        (await readDetailCache(resortId).catch(() => null)) ??
        (await getSkiResortById(resortId).catch(() => null));
      if (!disposed) setSourceMap(data?.finalizedMapData ?? null);
    })();
    return () => {
      disposed = true;
    };
  }, [resortId]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    setError(false);
    setTarget(null);
    async function load() {
      try {
        const cached =
          retry === 0 ? await readDetailCache(candidate.resortId) : null;
        const data = cached ?? (await getSkiResortById(candidate.resortId));
        const all = data?.finalizedMapData?.courses?.features ?? [];
        // Do not silently substitute another route if a recommendation is stale.
        const courses = all.filter(course =>
          candidate.selected.routeId
            ? course.routeKey === candidate.selected.routeId
            : course.groupId === candidate.selected.id ||
              course.id === candidate.selected.id,
        );
        const group = findSelectedCourseGroup(
          createFinalizedCourseGroups(courses),
          candidate.selected,
        );
        if (!group?.courses.length || !data?.finalizedMapData)
          throw new Error("Course unavailable");
        if (!disposed) setTarget({ group, mapData: data.finalizedMapData });
      } catch {
        if (!disposed) setError(true);
      }
    }
    void load();
    return () => {
      disposed = true;
    };
  }, [candidate, retry]);
  const rating = recommendationGrade(candidate.score);
  const rows = comparisonScoreRows(candidate);
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="z-[501] flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-3 overflow-hidden p-3 sm:max-w-5xl sm:p-5"
        overlayClassName="z-[500] bg-black/30"
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle className="text-base font-bold">コース比較</DialogTitle>
          <DialogDescription className="text-xs">
            {rating.grade}・{rating.label}{" "}
            <span className="font-semibold text-blue-700">
              {candidate.score.toFixed(1)} / 100点
            </span>
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="courses" className="min-h-0 flex-1 flex-col gap-3">
          <TabsList
            variant="line"
            className="w-full shrink-0 justify-start gap-6 border-b border-slate-200 p-0"
          >
            <TabsTrigger value="courses" className={TEXT_TAB_CLASS}>
              コース
            </TabsTrigger>
            <TabsTrigger value="criteria" className={TEXT_TAB_CLASS}>
              評価基準
            </TabsTrigger>
          </TabsList>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <TabsContent value="courses" className="flex flex-col gap-4">
              {/* スマホは地図と断面図を横に並べると読めないので切り替える */}
              <div
                role="radiogroup"
                aria-label="表示する図"
                className="flex w-fit gap-0.5 rounded-full bg-slate-100 p-0.5 md:hidden"
              >
                {(
                  [
                    ["map", "地図"],
                    ["profile", "断面図"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mobileView === value}
                    onClick={() => setMobileView(value)}
                    className={`h-7 rounded-full px-3 text-xs font-semibold ${mobileView === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <CourseRow
                label="選択中"
                resortName={resortName}
                group={source}
                resortId={resortId}
                mapData={sourceMap}
                selection={sourceSelection}
                mobileView={mobileView}
              />
              {target ? (
                <CourseRow
                  label="類似コース"
                  resortName={candidate.resortName}
                  group={target.group}
                  resortId={candidate.resortId}
                  mapData={target.mapData}
                  selection={candidate.selected}
                  mobileView={mobileView}
                />
              ) : (
                <TargetState
                  error={error}
                  onRetry={() => setRetry(n => n + 1)}
                />
              )}
              <p className="text-xs text-slate-500">
                線の色は斜度です。断面図は縦横同じ縮尺なので、各図の目盛りを確認して比較してください。
                {courseGroup.courses.length !== source.courses.length &&
                  "選択中のコースは、評価に使用したメインルートを表示しています。"}
              </p>
            </TabsContent>
            <TabsContent value="criteria" className="space-y-3">
              <div className="overflow-hidden border-y border-slate-200">
                <table className="w-full text-left text-xs tabular-nums sm:text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-2.5 font-medium">項目</th>
                      <th className="p-2.5 text-right font-medium">類似度</th>
                      <th className="p-2.5 text-right font-medium">配点</th>
                      <th className="p-2.5 text-right font-medium">得点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.label} className="border-t border-slate-100">
                        <th className="p-2.5 font-medium text-slate-700">
                          {row.label}
                        </th>
                        <td className="p-2.5 text-right">
                          {row.similarity.toFixed(1)}%
                        </td>
                        <td className="p-2.5 text-right">{row.weight * 100}</td>
                        <td className="p-2.5 text-right font-semibold text-blue-700">
                          {row.points.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-300 text-slate-900">
                    <tr>
                      <th colSpan={3} className="p-2.5">
                        合計
                      </th>
                      <td className="p-2.5 text-right font-bold">
                        {candidate.score.toFixed(1)}点
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-slate-600">
                類似度 ×
                配点の合計（100点満点）。A：80点以上、B：60点以上、C：60点未満。
              </p>
              <details className="text-xs leading-relaxed text-slate-500">
                <summary className="w-fit cursor-pointer text-slate-700">
                  計算方法
                </summary>
                <p className="mt-2">
                  急斜面の斜度は最も急な50m区間の平均です（50m未満は全長）。急な区間の長さは、その斜度の80%以上になる区間の総距離です。全体の斜度分布は3°刻みで比較します。圧雪状態や曲がり方の近い候補を優先して選んでいます。
                </p>
                <p className="mt-2">
                  得点と合計は小数第1位に丸めています。表示上の合計には最大0.2点の差が生じます。
                </p>
                <p className="mt-2">
                  地形データの近さを示す評価です。体感や難易度の一致率ではありません。
                </p>
              </details>
              {(candidate.shapeDifferent || candidate.groomingDifferent) && (
                <p className="text-xs text-amber-900">
                  {[
                    candidate.shapeDifferent ? "曲がり方が異なります" : null,
                    candidate.groomingDifferent ? "圧雪状態が異なります" : null,
                  ]
                    .filter(Boolean)
                    .join("。")}
                  。
                </p>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function TargetState({
  error,
  onRetry,
}: {
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500"
    >
      {error ? (
        <>
          <p>コースデータを取得できませんでした。</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            再読み込み
          </Button>
        </>
      ) : (
        "コースデータを読み込み中…"
      )}
    </div>
  );
}
