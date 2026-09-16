"use client";

import { useState } from "react";
import type { SelectedMapFeature } from "@/features/map/types";
import {
  COURSE_DIFFICULTY_META,
  type FinalizedResortMapData,
  getCourseDifficulty,
} from "@/lib/finalizedResortGeojsonShared";
import {
  CompactMetric,
  operationText,
  SourceLine,
  StatusMark,
} from "../components/CompactInfo";
import type { Resort } from "../types";
import { slopeDistribution, sumKnown } from "../utils/courseDistribution";
import {
  createFinalizedCourseGroups,
  formatDegree,
  formatMeters,
  getCourseGroupPisteSymbol,
  getCourseGroupStatus,
  maxNullable,
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
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState(false);
  const section = finalizedMapData?.courses;
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
  const levels = Object.entries(colors).map(([key, color]) => ({
    key,
    color,
    label: COURSE_DIFFICULTY_META[key as keyof typeof colors].label,
    count: rows.filter(row => row.difficulty === key).length,
  }));
  const displayed = rows
    .filter(row => filter === "all" || row.difficulty === filter)
    .sort((a, b) => (sort ? (b.distance ?? -1) - (a.distance ?? -1) : 0));
  return (
    <div className="space-y-4">
      <section>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
          <CompactMetric label="総滑走距離">
            {formatMeters(distance.total)}
          </CompactMetric>
          <CompactMetric label="全面滑走 / 全コース">
            {operationText(rows.map(row => row.status))}
          </CompactMetric>
        </dl>
        <p className="mt-1 text-[11px] text-slate-500">
          斜面に沿った距離の合計（地形データ優先・公表値で補完）
          {distance.missing > 0 && ` · 距離不明${distance.missing}区間を除く`}
        </p>
        <SourceLine
          label="コース状況"
          time={section?.observedAt}
          urls={section?.sourceUrls}
          updates={features.map(c => c.properties.update ?? "")}
        />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-bold">
          レベル別割合{" "}
          <span className="text-xs font-normal text-slate-500">
            コース数ベース
          </span>
        </h2>
        {rows.length ? (
          <>
            <div
              className="flex h-5 overflow-hidden rounded"
              role="img"
              aria-label={levels
                .map(
                  l =>
                    `${l.label} ${Math.round((l.count / rows.length) * 100)}%`,
                )
                .join("、")}
            >
              {levels
                .filter(l => l.count)
                .map(l => (
                  <div
                    key={l.key}
                    style={{
                      width: `${(l.count / rows.length) * 100}%`,
                      background: l.color,
                    }}
                  />
                ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {levels
                .filter(l => l.count)
                .map(l => (
                  <span key={l.key} style={{ color: l.color }}>
                    ● {l.label} {Math.round((l.count / rows.length) * 100)}%
                  </span>
                ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">難易度データなし</p>
        )}
        <h3 className="pt-2 text-sm font-bold">
          斜度別割合{" "}
          <span className="text-xs font-normal text-slate-500">
            滑走距離ベース・5°刻み
          </span>
        </h3>
        {distribution.total > 0 ? (
          <div className="grid grid-cols-3 gap-x-3 gap-y-2">
            {distribution.bins
              .filter((b, i) => i < 9 || b.distance > 0)
              .map(bin => (
                <div key={bin.label} className="text-[11px]">
                  <div className="flex justify-between gap-1">
                    <span>{bin.label}</span>
                    <span className="tabular-nums">
                      {bin.percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-slate-100">
                    <div
                      className="h-full rounded bg-blue-600"
                      style={{ width: `${bin.percent}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            標高付きのコースデータがないため集計できません。
          </p>
        )}
        <p className="text-[11px] text-slate-500">
          地形の各区間から算出。
          {distribution.omitted > 0
            ? `標高不明の${distribution.omitted}区間は集計対象外。`
            : ""}
          端数処理により合計が100%にならない場合があります。
        </p>
      </section>
      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">
            コース一覧{" "}
            {section?.verificationStatus === "verified" && (
              <span className="text-[11px] font-normal text-slate-500">
                確認済み
              </span>
            )}
          </h2>
          <select
            aria-label="難易度で絞り込み"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="h-8 max-w-36 rounded border px-2 text-xs"
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
        <div className="my-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
          <span>○ 全面 △ 一部 × 閉鎖 — 不明</span>
          <span className="border px-1">圧雪</span>
          <span className="bg-amber-100 px-1">一部圧雪</span>
          <span className="bg-sky-100 px-1">非圧雪</span>
          <span className="bg-slate-100 px-1">圧雪不明</span>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
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
            <p className="p-4 text-center text-xs text-slate-500">
              コースデータがありません
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
