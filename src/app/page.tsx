"use client";

import { AnimatePresence } from "framer-motion";
import type L from "leaflet";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Drawer } from "vaul";
import { FilterPanel, type Filters } from "@/components/FilterPanel";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { SkiResortDetailView } from "@/components/SkiResortDetailView";
import { SkiResortList } from "@/components/SkiResortList";
import type { SkiResortT } from "@/types/index";

export default function Home() {
  // マップコンポーネントを SSR 無効で動的インポート
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

  // --- State管理 ---
  const [filters, setFilters] = useState<Filters>({
    keyword: "",
    status: false,
    yukiMagi: false,
    beginnerFriendly: false,
    minVertical: 0,
    minCourses: 0,
  });
  const [selectedResortId, setSelectedResortId] = useState<string | null>(null);
  const [isListSheetOpen, setIsListSheetOpen] = useState(false);
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null);

  // --- データ絞り込みロジック ---

  // 1. フィルターパネルによる絞り込み
  const filteredResorts = useMemo(() => {
    const skiResorts = require("../lib/mock-data.json");
    return skiResorts.filter((resort: SkiResortT) => {
      if (filters.status && !resort.outline?.status?.includes("滑走可"))
        return false;
      if (filters.yukiMagi && !resort.yukiMagi?.available) return false;
      if (
        filters.beginnerFriendly &&
        resort.courses.beginnersCoursesPercent < 30
      )
        return false;
      if (
        filters.keyword !== "" &&
        !resort.name.ja.toLowerCase().includes(filters.keyword.toLowerCase())
      )
        return false;
      if (filters.minVertical > resort.courses.vertical) return false;
      if (filters.minCourses > resort.courses.numberOfCourses) return false;
      return true;
    });
  }, [filters]);

  // 2. 地図の表示領域による絞り込み
  const visibleResorts = useMemo(() => {
    if (!mapBounds) return []; // 地図の範囲が未設定の場合は空にする
    return filteredResorts.filter((resort: SkiResortT) => {
      const point = {
        lat: resort.location.latitude,
        lng: resort.location.longitude,
      };
      return mapBounds.contains(point);
    });
  }, [filteredResorts, mapBounds]);

  // 3. 詳細表示用のスキー場データを選択
  const selectedResort = useMemo(() => {
    if (!selectedResortId) return null;
    const skiResorts = require("../lib/mock-data.json");
    return (
      skiResorts.find((r: SkiResortT) => r.id === selectedResortId) || null
    );
  }, [selectedResortId]);

  // --- イベントハンドラ ---
  const handleFilterChange = (newFilters: Filters) => setFilters(newFilters);
  const handleSelectResort = (id: string) => setSelectedResortId(id);
  const handleCloseDetail = () => setSelectedResortId(null);

  return (
    <main className="relative h-screen w-screen overflow-hidden md:flex">
      {/* --- 地図表示エリア --- */}
      <div className="h-full w-full">
        <FilterPanel filters={filters} onFilterChange={handleFilterChange} />
        <DynamicMap
          resorts={filteredResorts}
          onSelectResort={handleSelectResort}
          onBoundsChange={setMapBounds}
        />
      </div>

      {/* --- PC用の右カラム --- */}
      <div className="hidden h-full w-[380px] flex-shrink-0 border-l md:block">
        <SkiResortList
          resorts={visibleResorts}
          onSelectResort={handleSelectResort}
        />
      </div>

      {/* --- スマートフォン用のボトムシート --- */}
      <div className="md:hidden">
        <Drawer.Root
          open={isListSheetOpen}
          onOpenChange={setIsListSheetOpen}
          shouldScaleBackground
        >
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-[9998] bg-black/40" />
            <Drawer.Content
              className="fixed bottom-0 left-0 right-0 z-[9999] flex flex-col rounded-t-xl bg-gray-100"
              style={{ height: "min(80vh, 800px)" }}
            >
              <Drawer.Title className="sr-only">スキー場リスト</Drawer.Title>
              <div className="mx-auto my-4 h-1.5 w-12 flex-shrink-0 rounded-full bg-gray-300" />
              <div className="flex-grow overflow-y-auto">
                <SkiResortList
                  resorts={visibleResorts}
                  onSelectResort={handleSelectResort}
                />
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
        <button
          type="button"
          className={`fixed bottom-0 left-0 right-0 z-[9999] flex h-16 cursor-pointer items-center justify-center rounded-t-xl border-t bg-gray-100 p-4 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] transition-opacity duration-300 md:hidden ${isListSheetOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
          onClick={() => setIsListSheetOpen(true)}
          aria-label="リストを開く"
        >
          <div className="absolute top-2 h-1.5 w-12 rounded-full bg-gray-300" />
          <h2 className="pt-2 text-lg font-bold text-gray-800">
            {visibleResorts.length}件のスキー場
          </h2>
        </button>
      </div>

      {/* --- 詳細モーダルの表示 --- */}
      <AnimatePresence>
        {selectedResort && (
          <SkiResortDetailView
            resort={selectedResort}
            onClose={handleCloseDetail}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
