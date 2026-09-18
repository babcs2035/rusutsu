"use client";

import { z } from "zod";
import { useScreenState } from "@/features/map/session/useScreenState";
import type { SelectedMapFeature } from "@/features/map/types";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { SourceLine, StatusMark } from "../components/CompactInfo";
import { LiftTypeIcon } from "../components/LiftTypeIcon";
import { StatusBreakdownTable } from "../components/StatusBreakdownTable";
import type { Resort } from "../types";
import { sumKnown } from "../utils/courseDistribution";
import { hasSourceUrl, sourceUrls } from "../utils/currentConditions";
import {
  formatMeters,
  getLiftElevationDiff,
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
  const section = finalizedMapData?.lifts;
  const liftStatus = createLiftStatusSummary(section);
  const features = section?.features ?? [];
  const rows = features.length
    ? features.map(lift => ({
        id: lift.id,
        name: lift.name,
        mapped: true,
        properties: {
          ...lift.properties,
          vertical: getLiftElevationDiff(lift),
          officialDistance: lift.properties.distance,
          distance: lift.properties.slopeDistMap ?? lift.properties.distance,
        },
      }))
    : resort.lifts.map(lift => ({
        id: lift.id,
        name: lift.name,
        mapped: false,
        properties: {
          ...lift,
          status: null,
          officialDistance: lift.distance,
          capacity: null,
          speed: null,
          vertical: null,
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
          link: null,
          horizontalDistMap: null,
          slopeDistMap: null,
        },
      }));
  const distance = sumKnown(rows.map(row => row.properties.distance));
  const hasSource = hasSourceUrl(section?.sourceUrls);
  // 全体行と種別ごとの行は同じリフト集合を数えるので、足すと全体に一致する。
  // 種別が1つしかないときは全体行と同じ内容になるので、内訳は出さない。
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
  const breakdownRows = [
    {
      label: "全体",
      summary: summarizeCourseStatuses(
        rows.map(row => normalizeIconSymbol(row.properties.status)),
      ),
      distance: distance.total,
    },
    ...(typeGroups.length > 1
      ? typeGroups.map(group => ({
          label: group.label,
          summary: summarizeCourseStatuses(group.rows.map(row => row.status)),
          distance: sumKnown(group.rows.map(row => row.distance)).total,
        }))
      : []),
  ];
  const types = [
    ...new Set(
      rows
        .map(row => row.properties.type)
        .filter((type): type is string => Boolean(type)),
    ),
  ];
  const displayed = rows.filter(
    row => filter === "all" || row.properties.type === filter,
  );
  const headers = [
    "状況",
    "リフト名",
    "タイプ",
    "定員",
    "距離",
    "標高差",
    "速度",
    "山麓標高",
    "山頂標高",
    "フード",
    "足置き",
    "支柱数",
    "信号",
    "油よけ",
    "メーカー",
    "設置年",
    "早朝",
    "ナイター",
    "水平距離",
    "公表距離",
    "発表・更新",
    "運行コメント",
    "備考",
    "関連情報",
  ];
  return (
    <div className="space-y-3">
      <StatusBreakdownTable
        kind="lift"
        rows={breakdownRows}
        countLabel="本数"
        unavailable={!hasSource}
        source={
          hasSource ? (
            <SourceLine
              label="リフト"
              showLabel={false}
              showFetched={false}
              urls={section?.sourceUrls}
              updates={liftStatus?.updates}
            />
          ) : undefined
        }
      />
      <p className="text-sm text-slate-700">
        距離は地形データ優先・公表値で補完
        {distance.missing > 0 && ` · 距離不明${distance.missing}本を除く`}
      </p>
      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">リフト一覧</h2>
          <select
            aria-label="リフトタイプで絞り込み"
            value={filter}
            onChange={event => setFilter(event.target.value)}
            className="h-8 max-w-40 rounded border px-2 text-sm"
          >
            <option value="all">すべてのタイプ</option>
            {types.map(type => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>
        <p className="my-2 text-sm text-slate-600">
          <StatusMark symbol="○" lift /> 運行 <StatusMark symbol="△" lift />{" "}
          待機 <StatusMark symbol="×" lift /> 運休 · 横スクロールで設備情報 →
        </p>
        <div
          className="isolate overflow-x-auto rounded-lg border"
          role="region"
          aria-label="リフト一覧・横スクロール"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the wide table.
          tabIndex={0}
        >
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {headers.map((label, index) => (
                  <th
                    key={label}
                    scope="col"
                    className={`border-b bg-slate-50 px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap ${index === 0 ? "sticky left-0 z-20 w-10 min-w-10 max-w-10 px-1" : index === 1 ? "sticky left-10 z-20 w-32 min-w-32 max-w-32 border-r" : ""}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map(row => {
                const p = row.properties;
                const bg =
                  selectedFinalizedFeature?.id === row.id
                    ? "bg-blue-50"
                    : "bg-white";
                const values = [
                  p.capacity == null ? "—" : `${p.capacity}人`,
                  formatMeters(p.distance),
                  formatMeters(p.vertical),
                  p.speed,
                  formatMeters(p.bottom),
                  formatMeters(p.top),
                  p.hood,
                  p.footrest,
                  p.towers,
                  p.signal,
                  p.oilShield,
                  p.maker,
                  p.year,
                  p.morning,
                  p.night,
                  formatMeters(p.horizontalDistMap),
                  formatMeters(p.officialDistance),
                  p.update,
                  p.latestNote,
                  p.note,
                ];
                return (
                  <tr key={row.id}>
                    <td
                      className={`sticky left-0 z-10 w-10 min-w-10 max-w-10 border-b px-1 py-2 text-center ${bg}`}
                    >
                      <StatusMark symbol={normalizeIconSymbol(p.status)} lift />
                    </td>
                    <th
                      scope="row"
                      className={`sticky left-10 z-10 w-32 min-w-32 max-w-32 border-r border-b px-2 py-2 text-left font-semibold break-words ${bg}`}
                    >
                      {row.mapped ? (
                        <button
                          type="button"
                          className="min-h-8 text-left hover:underline"
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
                    <td className={`border-b px-3 py-2 ${bg}`}>
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <LiftTypeIcon type={p.type} />
                        {p.type ?? "—"}
                      </span>
                    </td>
                    {values.map((value, index) => (
                      <td
                        key={headers[index + 3]}
                        className={`max-w-64 border-b px-3 py-2 tabular-nums ${index >= 18 ? "min-w-40 whitespace-pre-line break-words" : "whitespace-nowrap"} ${bg}`}
                      >
                        {value ?? "—"}
                      </td>
                    ))}
                    <td className={`border-b px-3 py-2 ${bg}`}>
                      {sourceUrls(p.link).map(url => (
                        <ExternalLinkComponent
                          key={url}
                          href={url}
                          className="whitespace-nowrap text-blue-700 underline"
                        >
                          関連情報 ↗
                        </ExternalLinkComponent>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!displayed.length && (
            <p className="p-4 text-sm text-slate-700">
              リフトデータがありません
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
