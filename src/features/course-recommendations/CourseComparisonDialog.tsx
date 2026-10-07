"use client";

import dynamic from "next/dynamic";
import { Fragment, useEffect, useMemo, useState } from "react";
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
import type {
  ElevationProfileMapPoint,
  SelectedMapFeature,
} from "@/features/map/types";
import { ElevationProfile } from "@/features/resort-detail/components/ElevationProfile";
import {
  FeatureMetrics,
  FeatureTags,
} from "@/features/resort-detail/components/FeatureHeadline";
import type { FinalizedCourseGroup } from "@/features/resort-detail/types";
import {
  createConnectedCourseElevationProfile,
  createFinalizedCourseGroups,
  findSelectedCourseGroup,
  getCourseGroupMetricItems,
  getCourseGroupTags,
} from "@/features/resort-detail/utils/detailMetrics";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import type { CourseRecommendation } from "@/server/course-recommendations/repository";
import { recommendationGrade, recommendationSelection } from "./algorithm";
import { comparisonScoreRows, comparisonSourceGroup } from "./comparison";
import { loadComparisonMapData } from "./comparisonData";

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
      <p className="flex h-full items-center justify-center bg-slate-50 text-xs text-slate-500">
        地図を読み込み中…
      </p>
    ),
  },
);
const NOOP = () => undefined;
const MAP_RESORTS: [] = [];
/** 地図・断面図の枠。読み込み中も同じ大きさにして、表示が跳ねないようにする */
const FIGURE_BOX_CLASS = "h-60 rounded-lg border border-slate-200 md:h-64";
/** PCの断面図の描画部の上限。MacBook の画面で2コースともスクロールせずに収める */
const PROFILE_MAX_PLOT_HEIGHT = 110;

function CourseMap({
  mapData,
  resortId,
  selection,
  point,
  onPointChange,
}: {
  mapData: FinalizedResortMapData;
  resortId: string;
  selection: SelectedMapFeature;
  point: ElevationProfileMapPoint | null;
  onPointChange: (point: ElevationProfileMapPoint | null) => void;
}) {
  return (
    <div className={`isolate overflow-hidden ${FIGURE_BOX_CLASS}`}>
      <ResortFinalizedMap
        DynamicMap={DynamicMap}
        resortId={resortId}
        finalizedMapData={mapData}
        mapResorts={MAP_RESORTS}
        presentation="expanded"
        showToolbar={false}
        showContextLabels
        embedded
        selectedFinalizedFeature={selection}
        selectedElevationProfilePoint={point}
        onSelectedFinalizedFeatureChange={NOOP}
        onSelectedElevationProfilePointChange={onPointChange}
        courseColorMode="slope"
      />
    </div>
  );
}

/** 読み込み中・失敗のときの枠。地図・断面図と同じ大きさ */
function FigurePlaceholder({
  error,
  onRetry,
}: {
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-2 bg-slate-50 p-3 text-center text-xs text-slate-500 ${FIGURE_BOX_CLASS}`}
    >
      {error ? (
        <>
          <p>コースデータを取得できませんでした。</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            再読み込み
          </Button>
        </>
      ) : (
        "読み込み中…"
      )}
    </div>
  );
}

type ComparedCourse = {
  resortName: string;
  courseName: string;
  group: FinalizedCourseGroup | null;
  resortId: string;
  mapData: FinalizedResortMapData | null;
  selection: SelectedMapFeature;
  error?: boolean;
  onRetry?: () => void;
};

function CourseHeader({
  course,
  className = "",
}: {
  course: ComparedCourse;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 ${className}`}
    >
      <span className="shrink-0 text-xs font-semibold text-slate-500">
        {course.resortName}
      </span>
      <h3 className="min-w-0 break-words text-[13px] font-bold text-slate-900 md:text-sm">
        {course.group?.displayName ?? course.courseName}
      </h3>
      {course.group && <FeatureTags {...getCourseGroupTags(course.group)} />}
    </div>
  );
}

function CourseFigure({
  course,
  kind,
  point,
  onPointChange,
}: {
  course: ComparedCourse;
  kind: "map" | "profile";
  /** 断面図でなぞっている位置。PCは同じコースの地図にも点と斜度・標高を出す */
  point: ElevationProfileMapPoint | null;
  onPointChange: (point: ElevationProfileMapPoint | null) => void;
}) {
  if (kind === "map" && course.group && course.mapData)
    return (
      <CourseMap
        mapData={course.mapData}
        resortId={course.resortId}
        selection={course.selection}
        point={point}
        onPointChange={onPointChange}
      />
    );
  if (kind === "profile" && course.group)
    return (
      <div className="flex flex-col gap-2">
        {/* スマホは地図と並ばないので、いつもの横並びの数値を断面図の上に出す */}
        <div className="md:hidden">
          <FeatureMetrics items={getCourseGroupMetricItems(course.group)} />
        </div>
        <CourseProfile
          group={course.group}
          point={point}
          onPointChange={onPointChange}
        />
      </div>
    );
  return (
    <FigurePlaceholder
      error={course.error ?? false}
      onRetry={course.onRetry ?? NOOP}
    />
  );
}

/**
 * 2コースの数値を「左の値｜項目｜右の値」で並べる表。
 * PCだけ、下の段の断面図2つの間に置く。スマホは各断面図の上に横並びの数値を出す。
 */
function ComparisonTable({
  left,
  right,
  className = "",
}: {
  left: ComparedCourse;
  right: ComparedCourse;
  className?: string;
}) {
  const leftItems = left.group ? getCourseGroupMetricItems(left.group) : [];
  const rightItems = right.group ? getCourseGroupMetricItems(right.group) : [];
  return (
    <table
      className={`hidden w-full table-fixed rounded-lg md:table bg-slate-50 text-sm tabular-nums md:text-sm ${className}`}
    >
      <thead className="text-xs text-slate-500 md:hidden">
        <tr>
          <th className="w-[40%] max-w-0 truncate px-2 pt-1.5 text-right font-medium">
            {left.courseName}
          </th>
          <th className="w-[20%]">
            <span className="sr-only">項目</span>
          </th>
          <th className="w-[40%] max-w-0 truncate px-2 pt-1.5 text-left font-medium">
            {right.courseName}
          </th>
        </tr>
      </thead>
      <tbody>
        {leftItems.map((item, index) => (
          <tr key={item.title}>
            <td
              className="whitespace-nowrap px-2 py-1 text-right font-bold text-slate-900 md:py-1.5"
              title={item.detail ?? undefined}
            >
              {item.value}
            </td>
            <th
              scope="row"
              className="whitespace-nowrap px-1 py-1 text-center text-xs font-normal text-slate-500 md:py-1.5"
            >
              {item.title}
            </th>
            <td
              className="whitespace-nowrap px-2 py-1 text-left font-bold text-slate-900 md:py-1.5"
              title={rightItems[index]?.detail ?? undefined}
            >
              {rightItems[index]?.value ?? "–"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CourseProfile({
  group,
  point,
  onPointChange,
}: {
  group: FinalizedCourseGroup;
  point: ElevationProfileMapPoint | null;
  onPointChange: (point: ElevationProfileMapPoint | null) => void;
}) {
  const points = useMemo(
    () => createConnectedCourseElevationProfile(group.courses),
    [group],
  );
  return points.length >= 2 ? (
    <ElevationProfile
      points={points}
      activeDistance={point?.distance}
      onPointSelect={selected =>
        onPointChange({
          courseGroupId: group.id,
          courseName: group.displayName,
          coordinate: selected.coordinate,
          distance: selected.distance,
          elevation: selected.elevation,
          slope: selected.slope,
        })
      }
      maxPlotHeight={PROFILE_MAX_PLOT_HEIGHT}
      // PCは地図の点に斜度・標高が出るので、断面図の上の読み値は出さない
      desktopReadout={false}
    />
  ) : (
    <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
      断面図のデータがありません。
    </p>
  );
}

/** 推薦に使ったルートだけを取り出す。古い推薦なら別ルートで代用しない */
function findCandidateGroup(
  mapData: FinalizedResortMapData,
  selected: SelectedMapFeature,
) {
  const courses = (mapData.courses?.features ?? []).filter(course =>
    selected.kind === "course" && selected.routeId
      ? course.routeKey === selected.routeId
      : course.groupId === selected.id || course.id === selected.id,
  );
  const group = findSelectedCourseGroup(
    createFinalizedCourseGroups(courses),
    selected,
  );
  return group?.courses.length ? group : null;
}

export function CourseComparisonDialog({
  resortId,
  resortName,
  courseGroup,
  mapData,
  candidate,
  onClose,
}: {
  resortId: string;
  resortName: string;
  courseGroup: FinalizedCourseGroup;
  /** 詳細画面で表示中のスキー場の地図データ。あればそのまま使い、取り直さない */
  mapData?: FinalizedResortMapData | null;
  candidate: CourseRecommendation;
  onClose: () => void;
}) {
  const source = useMemo(
    () => comparisonSourceGroup(courseGroup),
    [courseGroup],
  );
  // スマホは「地図／断面図／評価基準」の3タブ、PCは「コース／評価基準」。
  // PCの「コース」とスマホの「地図」は同じ値にして、幅が変わっても選択を保つ。
  const [view, setView] = useState<"courses" | "profile" | "criteria">(
    "courses",
  );
  const mobileView = view === "profile" ? "profile" : "map";
  const [profilePoints, setProfilePoints] = useState<
    Record<"source" | "target", ElevationProfileMapPoint | null>
  >({ source: null, target: null });
  const sourceSelection = useMemo<SelectedMapFeature>(
    () =>
      recommendationSelection(courseGroup.id, courseGroup.courses) ?? {
        kind: "course",
        id: courseGroup.id,
      },
    [courseGroup],
  );
  // 選択中のコースは詳細画面が持っている地図データをそのまま使う。
  // 無いとき（呼び出し側が渡さないとき）だけ読み込む。
  const [loadedSource, setLoadedSource] = useState<{
    resortId: string;
    mapData: FinalizedResortMapData | null;
  } | null>(null);
  useEffect(() => {
    if (mapData) return;
    let disposed = false;
    loadComparisonMapData(resortId)
      .catch(() => null)
      .then(data => {
        if (!disposed) setLoadedSource({ resortId, mapData: data });
      });
    return () => {
      disposed = true;
    };
  }, [mapData, resortId]);
  const sourceMap =
    mapData ??
    (loadedSource?.resortId === resortId ? loadedSource.mapData : null);

  const [retry, setRetry] = useState(0);
  // 結果はどの候補・何回目の読み込みかと一緒に持ち、前の比較の結果を出さない
  const targetKey = JSON.stringify([
    candidate.resortId,
    candidate.selected,
    retry,
  ]);
  const [target, setTarget] = useState<{
    key: string;
    group?: FinalizedCourseGroup;
    mapData?: FinalizedResortMapData;
    error?: boolean;
  } | null>(null);
  useEffect(() => {
    let disposed = false;
    const [targetResortId, selected, attempt] = JSON.parse(targetKey) as [
      string,
      SelectedMapFeature,
      number,
    ];
    loadComparisonMapData(targetResortId, { fresh: attempt > 0 })
      .then(data => {
        const group = data ? findCandidateGroup(data, selected) : null;
        if (!data || !group) throw new Error("Course unavailable");
        if (!disposed) setTarget({ key: targetKey, group, mapData: data });
      })
      .catch(() => {
        if (!disposed) setTarget({ key: targetKey, error: true });
      });
    return () => {
      disposed = true;
    };
  }, [targetKey]);
  const currentTarget = target?.key === targetKey ? target : null;
  const sourceCourse: ComparedCourse = {
    resortName,
    courseName: courseGroup.displayName,
    group: source,
    resortId,
    mapData: sourceMap,
    selection: sourceSelection,
  };
  const targetCourse: ComparedCourse = {
    resortName: candidate.resortName,
    courseName: candidate.name,
    group: currentTarget?.group ?? null,
    resortId: candidate.resortId,
    mapData: currentTarget?.mapData ?? null,
    selection: candidate.selected,
    error: currentTarget?.error ?? false,
    onRetry: () => setRetry(n => n + 1),
  };
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
        <DialogHeader className="shrink-0 flex-row flex-wrap items-baseline gap-x-2 gap-y-1 pr-8">
          <DialogTitle className="text-base font-bold">コース比較</DialogTitle>
          <DialogDescription className="text-xs">
            {rating.grade}・{rating.label}{" "}
            <span className="font-semibold text-blue-700">
              {candidate.score.toFixed(1)} / 100点
            </span>
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={view}
          onValueChange={value => setView(value as typeof view)}
          className="min-h-0 flex-1 flex-col gap-3"
        >
          <TabsList
            variant="line"
            className="w-full shrink-0 justify-start gap-6 border-b border-slate-200 p-0"
          >
            <TabsTrigger value="courses" className={TEXT_TAB_CLASS}>
              <span className="md:hidden">地図</span>
              <span className="hidden md:inline">コース</span>
            </TabsTrigger>
            <TabsTrigger
              value="profile"
              className={`${TEXT_TAB_CLASS} md:hidden`}
            >
              断面図
            </TabsTrigger>
            <TabsTrigger value="criteria" className={TEXT_TAB_CLASS}>
              評価基準
            </TabsTrigger>
          </TabsList>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            {/*
              地図・断面図は1つの面で持ち、タブを切り替えても地図を作り直さない
              （評価基準から戻ったときに寄せ直す動きを出さない）。
            */}
            <div
              role="tabpanel"
              className={`${view === "criteria" ? "hidden" : "flex"} flex-col gap-3`}
            >
              {/*
                PC: 名前と地図は左右半分ずつ。下の段は断面図2つの間に数値の表。
                  表の幅を真ん中の2列（5rem×2）に分けて、地図を同じ幅に揃える。
                スマホ: 2コースを縦に積み、タブで地図／断面図を切り替える。
              */}
              <div className="grid grid-cols-1 gap-y-2 md:grid-cols-[minmax(0,1fr)_5rem_5rem_minmax(0,1fr)] md:gap-x-3 md:gap-y-2">
                <ComparisonTable
                  left={sourceCourse}
                  right={targetCourse}
                  className="md:col-span-2 md:col-start-2 md:row-start-3 md:self-center"
                />
                {(
                  [
                    [
                      "source",
                      sourceCourse,
                      "md:col-span-2 md:col-start-1",
                      "md:col-start-1",
                    ],
                    [
                      "target",
                      targetCourse,
                      "md:col-span-2 md:col-start-3",
                      "md:col-start-4",
                    ],
                  ] as const
                ).map(([side, course, wide, narrow]) => (
                  <Fragment key={side}>
                    <CourseHeader
                      course={course}
                      className={`${side === "target" ? "mt-2 md:mt-0" : ""} md:row-start-1 ${wide}`}
                    />
                    <div
                      className={`min-w-0 ${mobileView === "map" ? "" : "hidden md:block"} md:row-start-2 ${wide}`}
                    >
                      <CourseFigure
                        course={course}
                        kind="map"
                        point={profilePoints[side]}
                        onPointChange={point =>
                          setProfilePoints(points => ({
                            ...points,
                            [side]: point,
                          }))
                        }
                      />
                    </div>
                    <div
                      className={`min-w-0 ${mobileView === "profile" ? "" : "hidden md:block"} md:row-start-3 ${narrow}`}
                    >
                      <CourseFigure
                        course={course}
                        kind="profile"
                        point={profilePoints[side]}
                        onPointChange={point =>
                          setProfilePoints(points => ({
                            ...points,
                            [side]: point,
                          }))
                        }
                      />
                    </div>
                  </Fragment>
                ))}
              </div>
              {courseGroup.courses.length !== source.courses.length && (
                <p className="text-xs text-slate-500">
                  選択中のコースは、評価に使用したメインルートを表示しています。
                </p>
              )}
            </div>
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
                  最大斜度は地図と同じ約40m平均の最大値で、10°違うと0%です。急斜面の距離は、選択中のコースの最大斜度の8割（最大斜度との差は最低5°）以上の斜面が続く距離を両コースで測り、比で比べます（3倍で0%）。全体の斜度分布は1°刻みの割合のずれで比べ（平均6°ずれると0%）、滑走距離は全長の比で比べます（3倍で0%）。圧雪状態や曲がり方の近い候補を優先して選んでいます。
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
