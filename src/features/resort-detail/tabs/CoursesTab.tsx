"use client";

import { Circle, Triangle, X } from "lucide-react";
import { z } from "zod";
import { recommendationSelection } from "@/features/course-recommendations/algorithm";
import { useScreenState } from "@/features/map/session/useScreenState";
import type { SelectedMapFeature } from "@/features/map/types";
import {
  getDetailCourseStatusFilter,
  useDetailCourseStatus,
} from "@/features/map/utils/detailCourseStatusFilter";
import { isCourseStatusVisible } from "@/features/map/utils/mapDisplaySettings";
import {
  COURSE_DIFFICULTY_META,
  type FinalizedCourseFeature,
  type FinalizedResortMapData,
  getCourseDifficulty,
  getSlopeColor,
} from "@/lib/finalizedResortGeojsonShared";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { SourceLine, StatusMark } from "../components/CompactInfo";
import { CourseStatusTable } from "../components/CourseStatusTable";
import { DistributionChart } from "../components/DistributionChart";
import { ObservationTimes } from "../components/ObservationTimes";
import { ariaSort, SortableHeader } from "../components/SortableHeader";
import type { Resort } from "../types";
import {
  groupSlopeBins,
  slopeDistribution,
  sumKnown,
} from "../utils/courseDistribution";
import { createMapCourseStatusSummary } from "../utils/courseStatusSummary";
import {
  type CourseSymbolField,
  courseDifficultyBands,
  courseNameBackground,
  courseSectionSymbols,
  type SectionSymbol,
} from "../utils/courseTablePresentation";
import { hasSourceUrl } from "../utils/currentConditions";
import {
  createFinalizedCourseGroups,
  formatDegree,
  formatElevationRange,
  formatMeters,
  getCourseGroupMetrics,
  getMainCourseGroup,
  normalizeIconSymbol,
  PISTE_STATUS_DESCRIPTION,
  type StatusSymbol,
} from "../utils/detailMetrics";
import {
  nextTableSort,
  type SortValue,
  sortRows,
  symbolSortValue,
  tableSortSchema,
} from "../utils/tableSort";

const colors = {
  beginner: "#15803d",
  beginnerIntermediate: "#9A3412",
  intermediate: "#b91c1c",
  intermediateAdvanced: "#7e22ce",
  advanced: "#1e293b",
  unknown: "#64748b",
};
const statusKinds = {
  "○": "open",
  "△": "limited",
  "×": "closed",
  不明: "unknown",
} as const;
const pisteIcons = { "○": Circle, "△": Triangle, "×": X };
const tableCellPadding =
  "border-b border-slate-200 px-1 py-2 @min-[21rem]/course-list:px-2";
const hasValue = (value: unknown) =>
  value != null && (typeof value !== "string" || value.trim().length > 0);
const optionalFields = [["動画", "youtubeUrl"]] as const;
const courseOptionalValues = (courses: FinalizedCourseFeature[]) =>
  Object.fromEntries(
    optionalFields.map(([label, key]) => [
      label,
      courses
        .filter(course => hasValue(course.properties[key]))
        .map(course => ({
          label: course.sectionName?.trim() || course.name,
          value: course.properties[key],
        })),
    ]),
  );

function PropertyMark({
  symbol,
  field,
}: {
  symbol: StatusSymbol | null;
  field: Exclude<CourseSymbolField, "status">;
}) {
  const Icon = symbol ? pisteIcons[symbol] : null;
  const label =
    field === "piste"
      ? symbol
        ? PISTE_STATUS_DESCRIPTION[symbol]
        : "圧雪不明"
      : `${field === "morning" ? "早朝" : "ナイター"}: ${symbol ?? "不明"}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center align-middle text-slate-700"
    >
      {Icon ? (
        <Icon aria-hidden="true" className="size-4" strokeWidth={2.25} />
      ) : (
        "不明"
      )}
    </span>
  );
}

function SectionMarks({
  sections,
  field = "status",
}: {
  sections: SectionSymbol[];
  field?: CourseSymbolField;
}) {
  const mark = (symbol: StatusSymbol | null) =>
    field === "status" ? (
      <StatusMark symbol={symbol} />
    ) : (
      <PropertyMark symbol={symbol} field={field} />
    );
  if (sections.length === 1) return mark(sections[0].symbol);
  return (
    <span className="inline-flex flex-col items-start gap-y-0.5 text-xs leading-4 text-slate-900 @min-[28rem]/course-list:text-sm">
      {sections.map(section => (
        <span
          key={section.label}
          className="inline-flex items-center gap-0.5 whitespace-nowrap"
        >
          <span>{section.label}</span>
          {mark(section.symbol)}
        </span>
      ))}
    </span>
  );
}

function OptionalValue({ label, value }: { label: string; value: string }) {
  const Icon =
    value === "○" || value === "△" || value === "×" ? pisteIcons[value] : null;
  return Icon ? (
    <Icon
      role="img"
      aria-label={`${label}: ${value}`}
      className="inline-block size-4 align-middle text-slate-700"
      strokeWidth={2.25}
    />
  ) : (
    value
  );
}
/** 「不明」は状況不明の列と紛らわしいので、レベル側は明示する */
const levelLabel = (key: string) =>
  key === "unknown"
    ? "レベル不明"
    : COURSE_DIFFICULTY_META[key as keyof typeof colors].label;
export const CoursesTab = ({
  resort,
  finalizedMapData,
  selectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
}: {
  resort: Resort;
  finalizedMapData: FinalizedResortMapData | null;
  selectedFinalizedFeature: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
}) => {
  const [filter, setFilter] = useScreenState(
    `rusutsu:detail:v1:${resort.id}:CoursesTab:filter`,
    z.string().max(100),
    "all",
  );
  const [sort, setSort] = useScreenState(
    `rusutsu:detail:v1:${resort.id}:CoursesTab:tableSort`,
    tableSortSchema,
    null,
  );
  // 「営業中のみ」は地図の状態をそのまま使い、ここで切り替えても地図に反映する
  const statusState = useDetailCourseStatus(resort.id);
  const statusFilter = getDetailCourseStatusFilter(statusState);
  const section = finalizedMapData?.courses;
  const courseStatus = createMapCourseStatusSummary(section);
  // 出典が未登録なら営業状況そのものが取れていない。区間数は地図のコースで数える。
  const hasSource = hasSourceUrl(
    courseStatus?.sourceUrls ?? section?.sourceUrls,
  );
  const features = section?.features ?? [];
  const groups = createFinalizedCourseGroups(features);
  const rows = groups.length
    ? groups.map(group => {
        const main = getMainCourseGroup(group);
        const metrics = getCourseGroupMetrics(main);
        const bands = courseDifficultyBands(main);
        const optional = courseOptionalValues(main.courses);
        return {
          id: group.id,
          selection: recommendationSelection(group.id, group.courses) ?? {
            kind: "course" as const,
            id: group.id,
          },
          name: group.displayName,
          difficulty: bands[0]?.difficulty ?? "unknown",
          difficulties: [...new Set(bands.map(band => band.difficulty))],
          nameBackground: courseNameBackground(bands),
          distance: metrics.distance,
          avg: metrics.averageSlope,
          max: metrics.maxSlope,
          elevationDiff: metrics.elevationDiff,
          elevationRange: formatElevationRange(metrics.elevationRange),
          status: courseSectionSymbols(main, "status"),
          piste: courseSectionSymbols(main, "piste"),
          morning: courseSectionSymbols(main, "morning"),
          night: courseSectionSymbols(main, "night"),
          mapped: true,
          optional,
        };
      })
    : resort.courses.map(c => ({
        id: c.id,
        selection: { kind: "course" as const, id: c.id },
        name: c.name,
        difficulty: getCourseDifficulty(c.difficulty),
        difficulties: [getCourseDifficulty(c.difficulty)],
        nameBackground: courseNameBackground([
          { difficulty: getCourseDifficulty(c.difficulty), fraction: 1 },
        ]),
        distance: null,
        avg: null,
        max: null,
        elevationDiff: null,
        elevationRange: null,
        status: [{ label: "", symbol: null }],
        piste: [{ label: "", symbol: null }],
        morning: [{ label: "", symbol: null }],
        night: [{ label: "", symbol: null }],
        mapped: false,
        optional: courseOptionalValues([]),
      }));
  const distribution = slopeDistribution(features);
  const levels = Object.keys(colors).map(key => ({
    key,
    label: levelLabel(key),
    count: rows.filter(row =>
      row.difficulties.includes(key as keyof typeof colors),
    ).length,
  }));
  // 「営業中のみ」は地図と同じ営業状況で区間を絞る。全体は薄い棒で残す。
  const isShownFeature = (course: FinalizedCourseFeature) =>
    !statusFilter ||
    isCourseStatusVisible(
      // 地図の getFeatureStatusKind と同じ判定（leaflet を読み込まないよう記号から引く）
      statusKinds[normalizeIconSymbol(course.properties.status) ?? "不明"],
      statusFilter,
    );
  const levelColumns = Object.keys(colors)
    .map(key => {
      const all = features.filter(
        course => getCourseDifficulty(course.properties.level) === key,
      );
      const open = all.filter(isShownFeature);
      return {
        key,
        // 棒は地図と同じ配色にして、地図で見た印象とそのまま結び付くようにする
        color: COURSE_DIFFICULTY_META[key as keyof typeof colors].color,
        label: levelLabel(key),
        distance: sumKnown(all.map(c => c.properties.slopeDistMap)).total ?? 0,
        hasCourses: all.length > 0,
        openDistance:
          sumKnown(open.map(c => c.properties.slopeDistMap)).total ?? 0,
      };
    })
    .filter(column => column.hasCourses);
  const openSlopeBins = groupSlopeBins(
    slopeDistribution(features.filter(isShownFeature)).bins,
  );
  // 棒は地図と同じ配色にして、地図で見た斜度の印象とそのまま結び付くようにする
  const slopeColumns = groupSlopeBins(distribution.bins).map((bin, index) => ({
    key: bin.label,
    label: bin.label,
    color: getSlopeColor(bin.sample),
    distance: bin.distance,
    openDistance: openSlopeBins[index].distance,
  }));
  // 難易度に加え、該当するコースがあるときだけ圧雪・早朝・ナイターでも絞り込める
  const hasSymbol = (sections: SectionSymbol[], symbols: StatusSymbol[]) =>
    sections.some(
      section => section.symbol !== null && symbols.includes(section.symbol),
    );
  const featureFilters = [
    {
      value: "ungroomed",
      label: "非圧雪",
      match: (row: (typeof rows)[number]) => hasSymbol(row.piste, ["×"]),
    },
    {
      value: "morning",
      label: "早朝あり",
      match: (row: (typeof rows)[number]) => hasSymbol(row.morning, ["○", "△"]),
    },
    {
      value: "night",
      label: "ナイターあり",
      match: (row: (typeof rows)[number]) => hasSymbol(row.night, ["○", "△"]),
    },
  ].filter(option => rows.some(option.match));
  const activeFeatureFilter = featureFilters.find(
    option => option.value === filter,
  );
  const displayed = rows.filter(row =>
    activeFeatureFilter
      ? activeFeatureFilter.match(row)
      : filter === "all" ||
        row.difficulties.includes(filter as keyof typeof colors),
  );
  const optionalLabels = [
    "早朝",
    "ナイター",
    ...optionalFields.map(([label]) => label),
  ];
  const optionalColumns = optionalLabels.filter(label => {
    const field =
      label === "早朝" ? "morning" : label === "ナイター" ? "night" : null;
    return field
      ? rows.some(row => row[field].some(section => section.symbol !== null))
      : rows.some(row => row.optional[label].length > 0);
  });
  // 記号の列は ○（圧雪・営業あり）を上に、数値の列（幅など）は大きい順から始める
  const symbolColumns = new Set(["状況", "圧雪", "早朝", "ナイター"]);
  const sortValue = (row: (typeof rows)[number], key: string): SortValue => {
    const symbols = (sections: SectionSymbol[]) =>
      symbolSortValue(sections.map(section => section.symbol));
    if (key === "状況") return symbols(row.status);
    if (key === "圧雪") return symbols(row.piste);
    if (key === "早朝") return symbols(row.morning);
    if (key === "ナイター") return symbols(row.night);
    if (key === "距離") return row.distance;
    if (key === "平均") return row.avg;
    if (key === "最大") return row.max;
    if (key === "標高差") return row.elevationDiff;
    const numbers = (row.optional[key] ?? [])
      .map(entry => Number(entry.value))
      .filter(Number.isFinite);
    return numbers.length ? Math.max(...numbers) : null;
  };
  // 名前や更新日時・動画のような文字の列は並び替えない
  const isSortable = (key: string) =>
    !["コース名", "更新", "動画"].includes(key);
  const sortedRows = sortRows(displayed, sort, sortValue);
  const handleSort = (key: string) =>
    setSort(nextTableSort(sort, key, symbolColumns.has(key) ? "asc" : "desc"));
  const hasSectionStatuses = rows.some(row => row.status.length > 1);
  const statusColumnWidth = hasSectionStatuses
    ? "w-16 min-w-16 max-w-16 @min-[28rem]/course-list:w-18 @min-[28rem]/course-list:min-w-18 @min-[28rem]/course-list:max-w-18"
    : "w-12 min-w-12 max-w-12";
  const nameColumnOffset = hasSectionStatuses
    ? "left-16 @min-[28rem]/course-list:left-18"
    : "left-12";
  const cellValues = (row: (typeof rows)[number], label: string) => {
    const grouped = new Map<string, { labels: string[]; value: string }>();
    for (const entry of row.optional[label]) {
      const key = String(entry.value);
      const previous = grouped.get(key);
      if (previous) {
        if (!previous.labels.includes(entry.label))
          previous.labels.push(entry.label);
      } else {
        grouped.set(key, { labels: [entry.label], value: key });
      }
    }
    return [...grouped.values()].map(entry => ({
      label: entry.labels.join("・"),
      value: entry.value,
      showLabel: grouped.size > 1,
    }));
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <CourseStatusTable
          inline
          summary={courseStatus}
          unavailable={!hasSource}
          observedTime={
            hasSource ? (
              <ObservationTimes
                align="left"
                entries={[
                  {
                    label: "コース",
                    time: courseStatus?.observedAt ?? section?.observedAt,
                  },
                ]}
              />
            ) : undefined
          }
          source={
            hasSource ? (
              <SourceLine
                compact
                label="コース"
                showLabel={false}
                showFetched={false}
                urls={courseStatus?.sourceUrls ?? section?.sourceUrls}
                urlLabels={finalizedMapData?.courseStatusSummary?.sourceLabels}
                updates={
                  courseStatus?.updates ??
                  features.map(c => c.properties.update ?? "")
                }
              />
            ) : undefined
          }
        />
      </div>
      <DistributionChart
        title="難易度"
        columns={levelColumns}
        filtered={statusFilter !== null}
        emptyText="難易度データなし"
      />
      <DistributionChart
        title="斜度"
        note={
          distribution.omitted > 0
            ? `標高不明の${distribution.omitted}区間を除く`
            : undefined
        }
        columns={slopeColumns}
        filtered={statusFilter !== null}
        emptyText="標高付きのコースデータがないため集計できません。"
      />
      <section className="@container/course-list">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">コース一覧</h2>
          <select
            aria-label="コースを絞り込み"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="h-8 max-w-36 rounded border px-2 text-sm"
          >
            <option value="all">すべて</option>
            {levels
              .filter(l => l.count)
              .map(l => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            {featureFilters.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="my-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1 leading-none">
            <StatusMark symbol="○" /> 全面
          </span>
          <span className="inline-flex items-center gap-1 leading-none">
            <StatusMark symbol="△" /> 一部
          </span>
          <span className="inline-flex items-center gap-1 leading-none">
            <StatusMark symbol="×" /> 閉鎖
          </span>
          <span className="inline-flex items-center leading-none">— 不明</span>
        </div>
        <div
          className="isolate overflow-x-auto rounded-lg border"
          role="region"
          aria-label="コース一覧・横スクロール"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the additional course columns.
          tabIndex={0}
        >
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                {[
                  "状況",
                  "コース名",
                  "圧雪",
                  "距離",
                  "平均",
                  "最大",
                  "標高差",
                  ...optionalColumns,
                ].map(label => (
                  <th
                    key={label}
                    scope="col"
                    aria-sort={ariaSort(sort, label)}
                    className={`${label === "状況" ? "border-b border-slate-200 px-1 py-2" : tableCellPadding} sticky top-0 z-10 bg-slate-50 text-left whitespace-nowrap ${label === "状況" ? `left-0 z-30 ${statusColumnWidth}` : label === "コース名" ? `${nameColumnOffset} z-30 min-w-24 border-r` : ""}`}
                  >
                    {!isSortable(label) ? (
                      label
                    ) : (
                      <SortableHeader
                        label={label}
                        sortKey={label}
                        sort={sort}
                        onSort={handleSort}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => (
                <tr
                  key={row.id}
                  className={`border-t ${selectedFinalizedFeature?.id === row.id ? "outline outline-2 -outline-offset-2 outline-blue-600" : ""}`}
                >
                  <td
                    className={`sticky left-0 z-20 ${statusColumnWidth} border-b border-slate-200 bg-white px-0.5 py-2 text-center`}
                  >
                    <span className="flex items-center justify-center">
                      <SectionMarks sections={row.status} />
                    </span>
                  </td>
                  <td
                    className={`${tableCellPadding} sticky ${nameColumnOffset} z-20 min-w-24 border-r font-semibold text-black`}
                    style={{ background: row.nameBackground }}
                    title={row.difficulties
                      .map(key => COURSE_DIFFICULTY_META[key].label)
                      .join("・")}
                  >
                    {row.mapped ? (
                      <button
                        type="button"
                        className="min-h-8 text-left underline-offset-2 hover:underline"
                        aria-label={`${row.name}・${row.difficulties.map(key => COURSE_DIFFICULTY_META[key].label).join("・")}の詳細`}
                        onClick={() =>
                          onSelectedFinalizedFeatureChange(row.selection)
                        }
                      >
                        {row.name}
                      </button>
                    ) : (
                      row.name
                    )}
                  </td>
                  <td
                    className={`${tableCellPadding} text-center font-medium whitespace-nowrap`}
                  >
                    <SectionMarks sections={row.piste} field="piste" />
                  </td>
                  <td
                    className={`${tableCellPadding} whitespace-nowrap tabular-nums`}
                  >
                    {row.distance == null ? "" : formatMeters(row.distance)}
                  </td>
                  <td className={`${tableCellPadding} tabular-nums`}>
                    {row.avg == null ? "" : formatDegree(row.avg)}
                  </td>
                  <td className={`${tableCellPadding} tabular-nums`}>
                    {row.max == null ? "" : formatDegree(row.max)}
                  </td>
                  <td className={`${tableCellPadding} tabular-nums`}>
                    {row.elevationDiff == null
                      ? ""
                      : formatMeters(row.elevationDiff)}
                    {row.elevationRange && (
                      <div className="text-xs font-normal text-slate-500">
                        {row.elevationRange}
                      </div>
                    )}
                  </td>
                  {optionalColumns.map(label => (
                    <td
                      key={label}
                      className={`${tableCellPadding} max-w-64 whitespace-nowrap ${label === "早朝" || label === "ナイター" ? "text-center" : ""}`}
                    >
                      {label === "早朝" || label === "ナイター" ? (
                        <SectionMarks
                          sections={row[label === "早朝" ? "morning" : "night"]}
                          field={label === "早朝" ? "morning" : "night"}
                        />
                      ) : (
                        cellValues(row, label).map((entry, index) => (
                          <span
                            key={`${entry.label}-${entry.value}`}
                            className="mr-2"
                          >
                            {entry.showLabel && (
                              <span className="text-slate-500">
                                {entry.label}:{" "}
                              </span>
                            )}
                            {label === "動画" ? (
                              <ExternalLinkComponent
                                href={String(entry.value)}
                                className="text-blue-700 underline"
                              >
                                {"動画 ↗"}
                              </ExternalLinkComponent>
                            ) : (
                              <OptionalValue
                                label={label}
                                value={entry.value}
                              />
                            )}
                            {index < cellValues(row, label).length - 1
                              ? " · "
                              : ""}
                          </span>
                        ))
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!displayed.length && (
            <p className="p-4 text-center text-sm text-slate-700">
              コースデータがありません
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
