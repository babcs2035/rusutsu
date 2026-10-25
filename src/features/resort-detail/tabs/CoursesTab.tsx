"use client";

import { Circle, Triangle, X } from "lucide-react";
import type { CSSProperties } from "react";
import { z } from "zod";
import { useScreenState } from "@/features/map/session/useScreenState";
import type { SelectedMapFeature } from "@/features/map/types";
import {
  COURSE_DIFFICULTY_META,
  type FinalizedCourseFeature,
  type FinalizedResortMapData,
  getCourseDifficulty,
  getSlopeColor,
} from "@/lib/finalizedResortGeojsonShared";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { SourceLine, StatusMark } from "../components/CompactInfo";
import { ProportionBar } from "../components/ProportionBar";
import { StatusBreakdownTable } from "../components/StatusBreakdownTable";
import type { Resort } from "../types";
import {
  groupSlopeBins,
  slopeDistribution,
  sumKnown,
} from "../utils/courseDistribution";
import { hasSourceUrl } from "../utils/currentConditions";
import {
  createCourseLevelSummaries,
  createFinalizedCourseGroups,
  formatDegree,
  formatMeters,
  getCourseGroupPisteSymbol,
  getCourseGroupStatus,
  maxNullable,
  PISTE_STATUS_DESCRIPTION,
  type StatusSymbol,
  summarizeCourseStatuses,
} from "../utils/detailMetrics";

const colors = {
  beginner: "#15803d",
  beginnerIntermediate: "#9A3412",
  intermediate: "#b91c1c",
  intermediateAdvanced: "#9a3412",
  advanced: "#1e293b",
  unknown: "#64748b",
};
const rowBackgrounds: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(COURSE_DIFFICULTY_META).map(([key, meta]) => [
      key,
      `color-mix(in srgb, ${meta.color} 16%, white)`,
    ]),
  ),
  beginnerIntermediate: "#FFEDD5",
};
const pisteIcons = { "○": Circle, "△": Triangle, "×": X };
const tableCellPadding =
  "border-b border-slate-200 px-1 py-2 @min-[21rem]/course-list:px-2";
const hasValue = (value: unknown) =>
  value != null && (typeof value !== "string" || value.trim().length > 0);
const optionalFields = [
  ["早朝", "morning"],
  ["ナイター", "night"],
  ["最大幅", "maxWidth"],
  ["最小幅", "minWidth"],
  ["標高差", "elevationDiffMap"],
  ["更新", "update"],
  ["動画", "youtubeUrl"],
] as const;
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

function PisteMark({ symbol }: { symbol: StatusSymbol | null }) {
  const Icon = symbol ? pisteIcons[symbol] : null;
  const label = symbol ? PISTE_STATUS_DESCRIPTION[symbol] : "圧雪不明";
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
    `rusutsu:detail:v1:${resort.id}:CoursesTab:sort`,
    z.boolean(),
    false,
  );
  const courseStatus = finalizedMapData?.courseStatusSummary;
  const section = finalizedMapData?.courses;
  // 出典が未登録なら営業状況そのものが取れていない。区間数は地図のコースで数える。
  const hasSource = hasSourceUrl(
    courseStatus?.sourceUrls ?? section?.sourceUrls,
  );
  const features = section?.features ?? [];
  const groups = createFinalizedCourseGroups(features);
  const rows = groups.length
    ? groups.map(group => {
        const distance = sumKnown(
          group.courses.map(c => c.properties.slopeDistMap),
        );
        const slopes = group.courses.map(c => ({
          value: c.properties.avgSlopeDegMap,
          distance: c.properties.slopeDistMap,
        }));
        const known = slopes.filter(
          s => s.value != null && s.distance != null && s.distance > 0,
        );
        const weight = known.reduce((sum, s) => sum + (s.distance ?? 0), 0);
        return {
          id: group.id,
          name: group.displayName,
          difficulty: getCourseDifficulty(group.courses[0]?.properties.level),
          distance: distance.total,
          avg: weight
            ? known.reduce(
                (sum, s) => sum + (s.value ?? 0) * (s.distance ?? 0),
                0,
              ) / weight
            : group.courses.length === 1
              ? slopes[0].value
              : null,
          max: maxNullable(group.courses.map(c => c.properties.maxSlopeDegMap)),
          status: getCourseGroupStatus(group).symbol,
          piste: getCourseGroupPisteSymbol(group),
          mapped: true,
          optional: courseOptionalValues(group.courses),
        };
      })
    : resort.courses.map(c => ({
        id: c.id,
        name: c.name,
        difficulty: getCourseDifficulty(c.difficulty),
        distance: null,
        avg: null,
        max: null,
        status: null,
        piste: null,
        mapped: false,
        optional: courseOptionalValues([]),
      }));
  const distance = sumKnown(
    features.length
      ? features.map(c => c.properties.slopeDistMap)
      : rows.map(r => r.distance),
  );
  const distribution = slopeDistribution(features);
  const levelDistance = sumKnown(rows.map(row => row.distance)).total ?? 0;
  const levels = Object.keys(colors).map(key => {
    const levelRows = rows.filter(row => row.difficulty === key);
    const rowDistance = sumKnown(levelRows.map(row => row.distance)).total;
    return {
      key,
      // 帯は地図と同じ配色にして、地図で見た印象とそのまま結び付くようにする
      color: COURSE_DIFFICULTY_META[key as keyof typeof colors].color,
      label: levelLabel(key),
      count: levelRows.length,
      // 距離が1本も分からない区分は 0km ではなく「不明」として扱う
      distance: rowDistance,
      percent: levelDistance ? ((rowDistance ?? 0) / levelDistance) * 100 : 0,
    };
  });
  // 全体行と各レベル行は同じ数え方（地図のコース単位）でそろえ、足して合うようにする
  const levelSummaries = createCourseLevelSummaries(
    rows.map(row => ({ difficulty: row.difficulty, status: row.status })),
  );
  const breakdownRows = [
    {
      label: "全体",
      summary: summarizeCourseStatuses(rows.map(row => row.status)),
      distance: distance.total,
    },
    // レベルが1種類しかないときの内訳は全体行と同じ内容になるので出さない
    ...(levelSummaries.length > 1
      ? levelSummaries.map(({ difficulty, summary }) => ({
          label: levelLabel(difficulty),
          summary,
          distance:
            levels.find(level => level.key === difficulty)?.distance ?? null,
        }))
      : []),
  ];
  // 帯は地図と同じ配色にして、地図で見た斜度の印象とそのまま結び付くようにする
  const slopeSegments = groupSlopeBins(distribution.bins).map(bin => ({
    key: bin.label,
    label: bin.label,
    color: getSlopeColor(bin.sample),
    percent: bin.percent,
  }));
  const displayed = rows
    .filter(row => filter === "all" || row.difficulty === filter)
    .sort((a, b) => (sort ? (b.distance ?? -1) - (a.distance ?? -1) : 0));
  const optionalLabels = optionalFields.map(([label]) => label);
  const optionalColumns = optionalLabels.filter(label =>
    rows.some(row => row.optional[label].length > 0),
  );
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
      value: ["最大幅", "最小幅", "標高差"].includes(label)
        ? formatMeters(Number(entry.value))
        : entry.value,
      showLabel: grouped.size > 1,
    }));
  };
  return (
    <div className="space-y-4">
      <StatusBreakdownTable
        rows={breakdownRows}
        countLabel="区間"
        unavailable={!hasSource}
        source={
          hasSource ? (
            <SourceLine
              label="コース"
              showLabel={false}
              showFetched={false}
              urls={courseStatus?.sourceUrls ?? section?.sourceUrls}
              updates={
                courseStatus?.updates ??
                features.map(c => c.properties.update ?? "")
              }
            />
          ) : undefined
        }
      />
      <ProportionBar
        title="レベル別割合"
        note="滑走距離ベース"
        segments={levels}
        emptyText="難易度データなし"
      />
      <ProportionBar
        title="斜度別割合"
        note={`滑走距離ベース${distribution.omitted > 0 ? `・標高不明の${distribution.omitted}区間を除く` : ""}`}
        segments={slopeSegments}
        emptyText="標高付きのコースデータがないため集計できません。"
      />
      <section className="@container/course-list">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">コース一覧</h2>
          <select
            aria-label="難易度で絞り込み"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="h-8 max-w-36 rounded border px-2 text-sm"
          >
            <option value="all">すべての難易度</option>
            {levels
              .filter(l => l.count)
              .map(l => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
          </select>
        </div>
        <div className="my-2 flex flex-wrap gap-2 text-sm text-slate-600">
          <span>
            <StatusMark symbol="○" /> 全面 <StatusMark symbol="△" /> 一部{" "}
            <StatusMark symbol="×" /> 閉鎖 — 不明
          </span>
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
                  ...optionalColumns,
                ].map(label => (
                  <th
                    key={label}
                    scope="col"
                    className={`${label === "状況" ? "border-b border-slate-200 px-1 py-2" : tableCellPadding} sticky top-0 z-10 bg-slate-50 text-left whitespace-nowrap ${label === "状況" ? "left-0 z-30 w-9 min-w-9 max-w-9" : label === "コース名" ? "left-9 z-30 min-w-24 border-r" : ""}`}
                  >
                    {label === "距離" ? (
                      <button type="button" onClick={() => setSort(!sort)}>
                        距離 {sort ? "↓" : "↕"}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map(row => (
                <tr
                  key={row.id}
                  className={`border-t ${selectedFinalizedFeature?.id === row.id ? "outline outline-2 -outline-offset-2 outline-blue-600" : ""}`}
                  style={{ background: rowBackgrounds[row.difficulty] }}
                >
                  <td
                    className="sticky left-0 z-20 w-9 min-w-9 max-w-9 border-b border-slate-200 bg-[var(--row-bg)] px-1 py-2 text-center"
                    style={
                      {
                        "--row-bg": rowBackgrounds[row.difficulty],
                      } as CSSProperties
                    }
                  >
                    <StatusMark symbol={row.status} />
                  </td>
                  <td
                    className={`${tableCellPadding} sticky left-9 z-20 min-w-24 border-r bg-[var(--row-bg)] font-semibold`}
                    style={
                      {
                        color: colors[row.difficulty],
                        "--row-bg": rowBackgrounds[row.difficulty],
                      } as CSSProperties
                    }
                  >
                    {row.mapped ? (
                      <button
                        type="button"
                        className="min-h-8 text-left underline-offset-2 hover:underline"
                        aria-label={`${row.name}・${COURSE_DIFFICULTY_META[row.difficulty].label}の詳細`}
                        onClick={() =>
                          onSelectedFinalizedFeatureChange({
                            kind: "course",
                            id: row.id,
                          })
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
                    <PisteMark symbol={row.piste} />
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
                  {optionalColumns.map(label => (
                    <td
                      key={label}
                      className={`${tableCellPadding} max-w-64 whitespace-nowrap`}
                    >
                      {cellValues(row, label).map((entry, index) => (
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
                            <OptionalValue label={label} value={entry.value} />
                          )}
                          {index < cellValues(row, label).length - 1
                            ? " · "
                            : ""}
                        </span>
                      ))}
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
