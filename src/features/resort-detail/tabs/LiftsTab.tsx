"use client";

import { Circle, Triangle, X } from "lucide-react";
import { z } from "zod";
import { useScreenState } from "@/features/map/session/useScreenState";
import type { SelectedMapFeature } from "@/features/map/types";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { SourceLine, StatusMark } from "../components/CompactInfo";
import { CourseStatusTable } from "../components/CourseStatusTable";
import { createMapCourseSummary } from "../components/CurrentOverview";
import { LiftStatusChart } from "../components/LiftStatusChart";
import { ObservationTimes } from "../components/ObservationTimes";
import { ariaSort, SortableHeader } from "../components/SortableHeader";
import type { Resort } from "../types";
import { sumKnown } from "../utils/courseDistribution";
import { hasSourceUrl } from "../utils/currentConditions";
import {
  formatElevationRange,
  formatMeters,
  getLiftElevationDiff,
  getLiftElevationRange,
  normalizeIconSymbol,
  type StatusSymbol,
  summarizeCourseStatuses,
} from "../utils/detailMetrics";
import { createLiftStatusSummary } from "../utils/liftStatusSummary";
import {
  getLiftTypeLabel,
  groupByLiftType,
  type LiftTypeLabel,
} from "../utils/liftTypes";
import {
  nextTableSort,
  type SortValue,
  sortRows,
  symbolSortValue,
  tableSortSchema,
} from "../utils/tableSort";

const numberOrNull = (value: unknown) => {
  const number =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) ? number : null;
};

// 記号だけの値は、コース一覧の圧雪・早朝・ナイターと同じ大きさのアイコンで出す
const SYMBOL_ONLY = /^\s*[○〇◯△×✕✖]\s*$/u;
const symbolIcons = { "○": Circle, "△": Triangle, "×": X };

function SymbolMark({
  symbol,
  label,
}: {
  symbol: StatusSymbol | null;
  label: string;
}) {
  const Icon = symbol ? symbolIcons[symbol] : null;
  if (!Icon) return null;
  return (
    <span
      role="img"
      aria-label={`${label}: ${symbol}`}
      title={`${label}: ${symbol}`}
      className="inline-flex items-center justify-center align-middle text-slate-700"
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={2.25} />
    </span>
  );
}

// 種類はゴンドラ・ロープウェイなど大きな索道から並べ、チェアリフトを最後にする
const LIFT_KIND_ORDER: LiftTypeLabel[] = [
  "ゴンドラ",
  "ロープウェイ",
  "ケーブルカー",
  "動く歩道",
  "ロープトウ・Tバー",
  "その他",
  "リフト",
];
const liftKindSortValue = (type: string | null | undefined, name: string) => {
  if (!type?.trim()) return null;
  const label = getLiftTypeLabel({ type, name });
  // 種類の並びでは速度を見ないので、高速・低速のリフトもまとめて「リフト」とする
  const kind =
    label === "高速リフト" || label === "低速リフト" ? "リフト" : label;
  return LIFT_KIND_ORDER.indexOf(kind);
};
const speedSortValue = (speed: string | null | undefined) =>
  speed?.includes("高速") ? 0 : speed?.includes("低速") ? 1 : null;

const tableCellPadding =
  "border-b border-slate-200 px-1 py-2 @min-[21rem]/lift-list:px-2";

export const LiftsTab = ({
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
    `rusutsu:detail:v1:${resort.id}:LiftsTab:filter`,
    z.string().max(100),
    "all",
  );
  const [sort, setSort] = useScreenState(
    `rusutsu:detail:v1:${resort.id}:LiftsTab:tableSort`,
    tableSortSchema,
    null,
  );
  const section = finalizedMapData?.lifts;

  const features = section?.features ?? [];
  const rows = features.length
    ? features.map(lift => {
        const elevationRange = getLiftElevationRange(lift.coordinates);
        return {
          id: lift.id,
          name: lift.name,
          mapped: true,
          properties: {
            ...lift.properties,
            vertical: elevationRange
              ? elevationRange.max - elevationRange.min
              : getLiftElevationDiff(lift),
            elevationRange,
            distance: lift.properties.distance ?? lift.properties.slopeDistMap,
          },
        };
      })
    : resort.lifts.map(lift => ({
        id: lift.id,
        name: lift.name,
        mapped: false,
        properties: {
          ...lift,
          status: null,
          capacity: null,
          speed: null,
          vertical: null,
          elevationRange: null,
          bottom: null,
          top: null,
          footrest: null,
          towers: null,
          signal: null,
          oilShield: null,
          maker: null,
          year: null,
          morning: null,
          night: null,
          update: null,
          latestNote: null,
          note: null,
          slopeDistMap: null,
        },
      }));
  // 地図データがなければ営業状況も取れないので、本数だけを「不明」で数える
  const liftStatus =
    createLiftStatusSummary(section) ?? createMapCourseSummary(rows.length);
  const hasSource = hasSourceUrl(section?.sourceUrls);
  // 種別ごとの行は同じリフト集合を分けたものなので、足すと合計に一致する。
  const typeRows: Array<{
    label: LiftTypeLabel;
    status: StatusSymbol | null;
    distance: number | null;
  }> = rows.map(row => ({
    label: getLiftTypeLabel({
      type: row.properties.type,
      speed: row.properties.speed,
      name: row.name,
    }),
    status: normalizeIconSymbol(row.properties.status),
    distance: row.properties.distance,
  }));
  const typeGroups = groupByLiftType(typeRows, row => row.label);
  const statusDistance = (
    groupRows: typeof typeRows,
    status: StatusSymbol | null,
  ) =>
    sumKnown(
      groupRows.filter(row => row.status === status).map(row => row.distance),
    ).total ?? 0;
  const chartRows = typeGroups.map(group => ({
    label: group.label,
    summary: summarizeCourseStatuses(group.rows.map(row => row.status)),
    distance: sumKnown(group.rows.map(row => row.distance)).total,
    statusDistances: {
      open: statusDistance(group.rows, "○"),
      partial: statusDistance(group.rows, "△"),
      closed: statusDistance(group.rows, "×"),
      unknown: statusDistance(group.rows, null),
    },
  }));
  const types = [
    ...new Set(
      rows
        .map(row => row.properties.type)
        .filter((type): type is string => Boolean(type)),
    ),
  ];
  // 種別の値に加え、該当するリフトがあるときだけ高速・低速でも絞り込める
  const speedLabel = (row: (typeof rows)[number]) =>
    getLiftTypeLabel({
      type: row.properties.type,
      speed: row.properties.speed,
      name: row.name,
    });
  const speedFilters = (["高速リフト", "低速リフト"] as const).filter(
    label =>
      !types.includes(label) && rows.some(row => speedLabel(row) === label),
  );
  const displayed = rows.filter(
    row =>
      filter === "all" ||
      row.properties.type === filter ||
      (speedFilters.some(label => label === filter) &&
        speedLabel(row) === filter),
  );
  type LiftProperties = (typeof rows)[number]["properties"];
  const optionalMeters = (value: number | null) =>
    value == null ? null : formatMeters(value);
  const columns: Array<{
    title: string;
    value: (properties: LiftProperties) => string | number | null;
    /** 並び替えに使う値。無ければ表示値（数値なら数値、○△× なら記号順）で並べる */
    sortValue?: (properties: LiftProperties) => SortValue;
    /** 並び替えの初めの向き。指定が無ければ数値は大きい順、記号は ○ が上 */
    firstDir?: "asc" | "desc";
    wrap?: boolean;
    detail?: (properties: LiftProperties) => string | null;
  }> = [
    {
      title: "定員",
      value: p => (p.capacity == null ? null : `${p.capacity}人`),
      sortValue: p => numberOrNull(p.capacity),
    },
    {
      title: "距離",
      value: p => optionalMeters(p.distance),
      sortValue: p => p.distance,
    },
    {
      title: "標高差",
      value: p => optionalMeters(p.vertical),
      sortValue: p => p.vertical,
      detail: p => formatElevationRange(p.elevationRange),
    },
    {
      title: "速度",
      value: p => p.speed,
      sortValue: p => speedSortValue(p.speed),
      firstDir: "asc",
    },
    { title: "運行コメント", value: p => p.latestNote, wrap: true },
    { title: "フード", value: p => p.hood },
    { title: "フットレスト", value: p => p.footrest },
    {
      title: "支柱数",
      value: p => p.towers,
    },
    { title: "信号", value: p => p.signal },
    { title: "油よけカバー", value: p => p.oilShield },
    { title: "索道メーカー", value: p => p.maker },
    {
      title: "設置年",
      value: p => (p.year == null ? null : `${p.year}年`),
      sortValue: p => numberOrNull(p.year),
    },
    { title: "早朝営業", value: p => p.morning },
    { title: "ナイター営業", value: p => p.night },
    { title: "備考", value: p => p.note, wrap: true },
  ];
  const hasValue = (value: string | number | null) =>
    value != null && (typeof value !== "string" || value.trim().length > 0);
  // 絞り込みで列が入れ替わらないよう、スキー場の全リフトで判定する。
  const visibleColumns = columns.filter(column =>
    rows.some(
      row =>
        hasValue(column.value(row.properties)) ||
        Boolean(column.detail?.(row.properties)),
    ),
  );
  const headers = [
    "状況",
    "リフト名",
    "種類",
    ...visibleColumns.map(column => column.title),
  ];
  // 数値は大きい順、○△× は ○ を上に並べる。名前・メーカーなど文字の列は並び替えない
  const sortValue = (row: (typeof rows)[number], key: string): SortValue => {
    const p = row.properties;
    if (key === "状況") return symbolSortValue([p.status]);
    if (key === "種類") return liftKindSortValue(p.type, row.name);
    const column = visibleColumns.find(item => item.title === key);
    if (!column) return null;
    if (column.sortValue) return column.sortValue(p);
    const value = column.value(p);
    if (!hasValue(value)) return null;
    if (typeof value === "number") return value;
    return normalizeIconSymbol(value) ? symbolSortValue([value]) : null;
  };
  const isSortable = (key: string) =>
    key === "状況" ||
    key === "種類" ||
    rows.some(row => sortValue(row, key) != null);
  // 数値の列（定員・距離・支柱数など）だけ大きい順から始める
  const isNumericColumn = (key: string) => {
    const column = visibleColumns.find(item => item.title === key);
    if (column?.firstDir) return column.firstDir === "desc";
    return Boolean(
      column &&
        (column.sortValue ||
          rows.some(row => typeof column.value(row.properties) === "number")),
    );
  };
  const sortedRows = sortRows(displayed, sort, sortValue);
  const handleSort = (key: string) =>
    setSort(nextTableSort(sort, key, isNumericColumn(key) ? "desc" : "asc"));
  return (
    <div className="space-y-3">
      <CourseStatusTable
        inline
        kind="lift"
        summary={liftStatus}
        unavailable={!hasSource}
        observedTime={
          hasSource ? (
            <ObservationTimes
              align="left"
              entries={[{ label: "リフト", time: section?.observedAt }]}
            />
          ) : undefined
        }
        source={
          hasSource ? (
            <SourceLine
              compact
              label="リフト"
              showLabel={false}
              showFetched={false}
              urls={section?.sourceUrls}
              updates={liftStatus?.updates}
            />
          ) : undefined
        }
      />
      <LiftStatusChart rows={chartRows} unavailable={!hasSource} />
      <section className="@container/lift-list">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">リフト一覧</h2>
          <select
            aria-label="リフトを絞り込み"
            value={filter}
            onChange={event => setFilter(event.target.value)}
            className="h-8 max-w-40 rounded border px-2 text-sm"
          >
            <option value="all">すべて</option>
            {types.map(type => (
              <option key={type}>{type}</option>
            ))}
            {speedFilters.map(label => (
              <option key={label}>{label}</option>
            ))}
          </select>
        </div>
        <div className="my-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1 leading-none">
            <StatusMark symbol="○" lift /> 運行
          </span>
          <span className="inline-flex items-center gap-1 leading-none">
            <StatusMark symbol="△" lift /> 待機
          </span>
          <span className="inline-flex items-center gap-1 leading-none">
            <StatusMark symbol="×" lift /> 運休
          </span>
          <span className="inline-flex items-center leading-none">— 不明</span>
        </div>
        <div
          className="isolate overflow-x-auto rounded-lg border"
          role="region"
          aria-label="リフト一覧・横スクロール"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the wide table.
          tabIndex={0}
        >
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                {headers.map((label, index) => (
                  <th
                    key={label}
                    scope="col"
                    aria-sort={ariaSort(sort, label)}
                    className={`${index === 0 ? "border-b border-slate-200 px-1 py-2" : tableCellPadding} sticky top-0 z-10 bg-slate-50 text-left whitespace-nowrap ${index === 0 ? "left-0 z-30 w-12 min-w-12 max-w-12" : index === 1 ? "left-12 z-30 min-w-24 max-w-32 border-r" : ""}`}
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
              {sortedRows.map(row => {
                const p = row.properties;
                return (
                  <tr
                    key={row.id}
                    className={`border-t ${selectedFinalizedFeature?.id === row.id ? "outline outline-2 -outline-offset-2 outline-blue-600" : ""}`}
                  >
                    <td className="sticky left-0 z-20 w-12 min-w-12 max-w-12 border-b border-slate-200 bg-white px-0.5 py-2 text-center">
                      <span className="flex items-center justify-center">
                        <StatusMark
                          symbol={normalizeIconSymbol(p.status)}
                          lift
                        />
                      </span>
                    </td>
                    <th
                      scope="row"
                      className={`${tableCellPadding} sticky left-12 z-20 min-w-24 max-w-32 border-r bg-white text-left font-semibold break-words text-black`}
                    >
                      {row.mapped ? (
                        <button
                          type="button"
                          className="min-h-8 text-left underline-offset-2 hover:underline"
                          onClick={() =>
                            onSelectedFinalizedFeatureChange({
                              kind: "lift",
                              id: row.id,
                            })
                          }
                        >
                          {row.name}
                        </button>
                      ) : (
                        row.name
                      )}
                    </th>
                    <td className={`${tableCellPadding} whitespace-nowrap`}>
                      {p.type?.trim()}
                    </td>
                    {visibleColumns.map(column => {
                      const value = column.value(p);
                      const detail = column.detail?.(p);
                      return (
                        <td
                          key={column.title}
                          className={`${tableCellPadding} max-w-64 tabular-nums ${column.wrap ? "min-w-40 whitespace-pre-line break-words" : "whitespace-nowrap"}`}
                        >
                          {typeof value === "string" &&
                          SYMBOL_ONLY.test(value) ? (
                            <SymbolMark
                              symbol={normalizeIconSymbol(value)}
                              label={column.title}
                            />
                          ) : hasValue(value) ? (
                            value
                          ) : (
                            ""
                          )}
                          {detail && (
                            <div className="text-xs text-slate-500">
                              {detail}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!displayed.length && (
            <p className="p-4 text-center text-sm text-slate-700">
              リフトデータがありません
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
