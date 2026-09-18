"use client";

import { z } from "zod";
import { useScreenState } from "@/features/map/session/useScreenState";
import type { SelectedMapFeature } from "@/features/map/types";
import {
  COURSE_DIFFICULTY_META,
  type FinalizedResortMapData,
  getCourseDifficulty,
  getSlopeColor,
} from "@/lib/finalizedResortGeojsonShared";
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
  summarizeCourseStatuses,
} from "../utils/detailMetrics";

const colors = {
  beginner: "#15803d",
  beginnerIntermediate: "#854d0e",
  intermediate: "#b91c1c",
  intermediateAdvanced: "#9a3412",
  advanced: "#1e293b",
  unknown: "#64748b",
};
const backgrounds = { "○": "#ffffff", "△": "#fef3c7", "×": "#e0f2fe" };
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
          group.courses.map(
            c => c.properties.slopeDistMap ?? c.properties.distance,
          ),
        );
        const slopes = group.courses.map(c => ({
          value: c.properties.avgSlopeDegMap ?? c.properties.avg,
          distance: c.properties.slopeDistMap ?? c.properties.distance,
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
          max: maxNullable(
            group.courses.map(
              c => c.properties.maxSlopeDegMap ?? c.properties.max,
            ),
          ),
          status: getCourseGroupStatus(group).symbol,
          piste: getCourseGroupPisteSymbol(group),
          mapped: true,
        };
      })
    : resort.courses.map(c => ({
        id: c.id,
        name: c.name,
        difficulty: getCourseDifficulty(c.difficulty),
        distance: c.distance,
        avg: null,
        max: c.angle,
        status: null,
        piste: null,
        mapped: false,
      }));
  const distance = sumKnown(
    features.length
      ? features.map(c => c.properties.slopeDistMap ?? c.properties.distance)
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
      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">
            コース一覧{" "}
            {section?.verificationStatus === "verified" && (
              <span className="text-sm font-normal text-slate-700">
                確認済み
              </span>
            )}
          </h2>
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
          <span className="border px-1">圧雪</span>
          <span className="bg-amber-100 px-1">一部圧雪</span>
          <span className="bg-sky-100 px-1">非圧雪</span>
          <span className="bg-slate-100 px-1">圧雪不明</span>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {["状況", "コース名", "距離", "平均", "最大"].map(label => (
                  <th
                    key={label}
                    scope="col"
                    className="px-2 py-2 text-left whitespace-nowrap"
                  >
                    {label === "距離" ? (
                      <button type="button" onClick={() => setSort(!sort)}>
                        距離 {sort ? "↓" : "↕"}
                      </button>
                    ) : label === "平均" || label === "最大" ? (
                      `${label}斜度`
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
                  style={{
                    background: row.piste ? backgrounds[row.piste] : "#f1f5f9",
                  }}
                >
                  <td className="px-2 py-2 text-center">
                    <StatusMark symbol={row.status} />
                  </td>
                  <td
                    className="min-w-24 px-2 py-2 font-semibold"
                    style={{ color: colors[row.difficulty] }}
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
                  <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                    {formatMeters(row.distance)}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {formatDegree(row.avg)}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {formatDegree(row.max)}
                  </td>
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
