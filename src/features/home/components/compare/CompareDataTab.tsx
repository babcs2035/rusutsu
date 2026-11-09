"use client";

import { type ReactNode, useEffect, useState } from "react";
import { DistributionChart } from "@/features/resort-detail/components/DistributionChart";
import { LiftStatusChart } from "@/features/resort-detail/components/LiftStatusChart";
import {
  buildLevelColumns,
  buildSlopeColumns,
  type CourseStatusFilter,
} from "@/features/resort-detail/utils/courseChartColumns";
import { hasSourceUrl } from "@/features/resort-detail/utils/currentConditions";
import {
  buildLiftChartRows,
  liftChartInputsFromFeatures,
} from "@/features/resort-detail/utils/liftChartRows";
import { useBreakpointValue } from "@/hooks/use-breakpoint-value";
import { getResortLabelName } from "@/lib/resortAliases";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { UnderlineTabs } from "@/shared/components/UnderlineTabs";
import { COMPARE_CARD_GRID_CLASS } from "./constants";
import type { Resort } from "./types";

const maxOf = (values: number[]) => Math.max(0, ...values);

/**
 * 比較の「データ」タブ。詳細のコース・リフトタブと同じチャートを、
 * 項目（難易度・斜度・リフト）ごとの節に分けてスキー場のカードを並べる。
 * 項目名は節の見出しに 1 回だけ出し、チャート左上のマスにはスキー場名を入れて
 * 同じ見出しを繰り返さない。棒の長さは節の中で共通の目盛りにする。
 * 「営業中のみ」はゲレンデタブと同じ設定（statusFilter）を使い、効く項目
 * （難易度・斜度）の見出しの中に置く。スマホは項目をタブで 1 つずつ出す。
 */
export function CompareDataTab({
  resorts,
  statusFilter,
  courseStatusControl,
  onMapResortsNeeded,
}: {
  resorts: Resort[];
  /** 「営業中のみ」で残す営業状況。null なら絞り込まない */
  statusFilter: CourseStatusFilter | null;
  /** 「営業中のみ」の操作。コースの項目（難易度・斜度）の見出しに添える */
  courseStatusControl?: ReactNode;
  onMapResortsNeeded?: (ids: string[]) => void;
}) {
  const isMobile = !(useBreakpointValue({ base: false, md: true }) ?? false);
  const [mobileSection, setMobileSection] = useState<
    "難易度" | "斜度" | "リフト"
  >("難易度");
  const idKey = resorts.map(resort => resort.id).join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: IDの並びが変わったときだけ呼ぶ
  useEffect(() => {
    onMapResortsNeeded?.(idKey ? idKey.split("\n") : []);
  }, [idKey]);

  const items = resorts.map(resort => {
    const map = resort.finalizedMapData;
    const courses = map?.courses?.features ?? [];
    // 営業状況の出典が無いスキー場は絞り込めないので、全体のまま出す
    const filter =
      statusFilter && hasSourceUrl(map?.courses?.sourceUrls)
        ? statusFilter
        : null;
    return {
      resort,
      name: getResortLabelName(resort.id, resort.nameJa, resort.shortName),
      loading: !map,
      filtered: filter !== null,
      levels: buildLevelColumns(courses, filter),
      slope: buildSlopeColumns(courses, filter),
      liftRows: buildLiftChartRows(
        liftChartInputsFromFeatures(map?.lifts?.features ?? []),
      ),
      liftUnavailable: !hasSourceUrl(map?.lifts?.sourceUrls),
    };
  });
  type Item = (typeof items)[number];
  const levelMax = maxOf(
    items.flatMap(item => item.levels.map(column => column.distance)),
  );
  const slopeMax = maxOf(
    items.flatMap(item => item.slope.columns.map(column => column.distance)),
  );
  const liftMax = maxOf(
    items.flatMap(item =>
      item.liftRows.map(row =>
        Object.values(row.statusDistances).reduce((sum, v) => sum + v, 0),
      ),
    ),
  );

  const sections: Array<{
    title: "難易度" | "斜度" | "リフト";
    /** 「営業中のみ」が効く項目か（コースの集計だけ） */
    course: boolean;
    render: (item: Item) => ReactNode;
  }> = [
    {
      title: "難易度",
      course: true,
      render: item => (
        <DistributionChart
          title={item.name}
          columns={item.levels}
          filtered={item.filtered}
          emptyText="難易度データなし"
          max={levelMax}
        />
      ),
    },
    {
      title: "斜度",
      course: true,
      render: item => (
        <DistributionChart
          title={item.name}
          note={
            item.slope.omitted > 0
              ? `標高不明の${item.slope.omitted}区間を除く`
              : undefined
          }
          columns={item.slope.columns}
          filtered={item.filtered}
          emptyText="標高付きのコースデータがないため集計できません。"
          max={slopeMax}
        />
      ),
    },
    {
      title: "リフト",
      course: false,
      render: item =>
        item.liftRows.length > 0 ? (
          <LiftStatusChart
            title={item.name}
            rows={item.liftRows}
            unavailable={item.liftUnavailable}
            max={liftMax}
          />
        ) : (
          <section className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900">{item.name}</h2>
            <p className="text-sm text-slate-700">リフトデータなし</p>
          </section>
        ),
    },
  ];

  const shown = isMobile
    ? sections.filter(section => section.title === mobileSection)
    : sections;

  return (
    <div className="@container w-full space-y-4">
      {isMobile && (
        <UnderlineTabs
          tabs={sections.map(section => section.title)}
          activeTab={mobileSection}
          onTabChange={setMobileSection}
          compact
          fit
          className="-mt-2"
        />
      )}
      {shown.map(section => (
        <section key={section.title} className="space-y-2">
          {/* 見出しの帯。項目名と、効く項目には「営業中のみ」を同じ行に置く */}
          <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border-l-4 border-l-blue-500 bg-blue-50 px-2.5 py-1">
            <h2 className="text-base font-bold text-blue-900">
              {section.title}
            </h2>
            {section.course && courseStatusControl}
          </div>
          <div className={COMPARE_CARD_GRID_CLASS}>
            {items.map(item => (
              <div
                key={item.resort.id}
                className="min-w-0 rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm"
              >
                {item.loading ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">
                      {item.name}
                    </p>
                    <div className="relative min-h-36 rounded bg-gray-50">
                      <LoadingSpinner
                        text=""
                        className="absolute inset-0 gap-0 [&_p]:hidden [&_svg]:size-6"
                      />
                    </div>
                  </div>
                ) : (
                  section.render(item)
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
