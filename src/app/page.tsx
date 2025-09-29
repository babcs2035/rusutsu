"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { FilterPanel, type Filters } from "@/components/FilterPanel";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { SkiResortList } from "@/components/SkiResortList";
import type { SkiResortT } from "@/types/index";
// SkiResortDetailView は次のステップでインポートします

export default function Home() {
  // 地図コンポーネントを SSR 無効で動的インポート
  const DynamicMap = useMemo(
    () =>
      dynamic(
        () => import("@/components/SkiResortMap").then(mod => mod.SkiResortMap),
        {
          loading: () => <LoadingSpinner text="地図を読み込んでいます..." />,
          ssr: false,
        },
      ),
    [],
  );

  // アプリケーション全体のフィルター状態
  const [filters, setFilters] = useState<Filters>({
    keyword: "",
    status: false,
    yukiMagi: false,
    beginnerFriendly: false,
    minVertical: 0,
    minCourses: 0,
  });

  // 選択されたスキー場の ID (詳細パネル表示に使用)
  const [selectedResortId, setSelectedResortId] = useState<string | null>(null);

  // フィルター条件に基づいて表示するスキー場を計算
  const filteredResorts = useMemo(() => {
    // load data from json
    const skiResorts = require("../lib/mock-data.json");
    return skiResorts.filter((resort: SkiResortT) => {
      // 「営業中」フィルター: "滑走可" という文字が含まれているかで判定
      if (filters.status && !resort.outline?.status?.includes("滑走可")) {
        return false;
      }

      // 「雪マジ対応」フィルター: データ内の `available` フラグで判定
      if (filters.yukiMagi && !resort.yukiMagi?.available) {
        return false;
      }

      // 「初心者向け」フィルター: 初心者コースが30%以上あるかで判定
      if (
        filters.beginnerFriendly &&
        resort.courses.beginnersCoursesPercent < 30
      ) {
        return false;
      }

      // キーワードフィルター
      if (
        filters.keyword !== "" &&
        !resort.name.ja.toLowerCase().includes(filters.keyword.toLowerCase())
      ) {
        return false;
      }

      // 標高差フィルター
      if (filters.minVertical > resort.courses.vertical) {
        return false;
      }

      // コース数フィルター
      if (filters.minCourses > resort.courses.numberOfCourses) {
        return false;
      }

      // 全ての条件をクリアしたスキー場のみ true を返す
      return true;
    });
  }, [filters]);

  // フィルターが変更されたときの処理
  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
  };

  // スキー場が選択されたときの処理
  const handleSelectResort = (id: string) => {
    setSelectedResortId(id);
    console.log("選択されたスキー場:", id);
  };

  // 詳細パネルを閉じる処理
  const handleCloseDetail = () => {
    setSelectedResortId(null);
  };

  return (
    <main className="flex h-screen w-screen overflow-hidden">
      <div className="relative flex-grow h-full">
        <FilterPanel filters={filters} onFilterChange={handleFilterChange} />
        <DynamicMap
          resorts={filteredResorts}
          onSelectResort={handleSelectResort}
        />
      </div>
      <div className="w-[380px] h-full flex-shrink-0 border-l relative">
        <SkiResortList
          resorts={filteredResorts}
          onSelectResort={handleSelectResort}
        />
        {/* 詳細パネル (SkiResortDetailView) の表示ロジックは次のステップでここに実装します */}
      </div>
    </main>
  );
}
