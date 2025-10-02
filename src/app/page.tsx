"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Drawer } from "vaul";
import { FilterPanel, type Filters } from "@/components/FilterPanel";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { SkiResortList } from "@/components/SkiResortList";
import type { SkiResortT } from "@/types/index";

export default function Home() {
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

  // フィルターの状態
  const [filters, setFilters] = useState<Filters>({
    keyword: "",
    status: false,
    yukiMagi: false,
    beginnerFriendly: false,
    minVertical: 0,
    minCourses: 0,
  });

  // 選択されたスキー場のID
  const [selectedResortId, setSelectedResortId] = useState<string | null>(null);

  // フィルター条件に基づいて表示するスキー場を計算
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

  // フィルターが変更されたときの処理
  const handleFilterChange = (newFilters: Filters) => setFilters(newFilters);

  // ボトムシートの開閉状態
  const [isListSheetOpen, setIsListSheetOpen] = useState(false);

  // スキー場が選択されたときの処理
  const handleSelectResort = (id: string) => {
    setSelectedResortId(id);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden md:flex">
      {/* --- 地図表示エリア --- */}
      <div className="h-full w-full">
        <FilterPanel filters={filters} onFilterChange={handleFilterChange} />
        <DynamicMap
          resorts={filteredResorts}
          onSelectResort={handleSelectResort}
        />
      </div>

      {/* --- PC用の右カラム (md以上の画面幅で表示) --- */}
      <div className="hidden h-full w-[380px] flex-shrink-0 border-l md:block">
        <SkiResortList
          resorts={filteredResorts}
          onSelectResort={handleSelectResort}
        />
      </div>

      {/* --- スマートフォン用のボトムシート (md未満の画面幅で表示) --- */}
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
              <div className="mx-auto my-4 h-1.5 w-12 flex-shrink-0 rounded-full bg-gray-300" />
              <div className="flex-grow overflow-y-auto">
                <SkiResortList
                  resorts={filteredResorts}
                  onSelectResort={handleSelectResort}
                />
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>

        {/* シートが閉じている時に表示される、常設のトリガーバー */}
        <button
          type="button"
          className={`fixed bottom-0 left-0 right-0 z-[9997] flex h-16 cursor-pointer items-center justify-center rounded-t-xl border-t bg-gray-100 p-4 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] transition-opacity duration-300 md:hidden ${
            isListSheetOpen ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          onClick={() => setIsListSheetOpen(true)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              setIsListSheetOpen(true);
            }
          }}
          aria-label="リストを開く"
        >
          <div className="absolute top-2 h-1.5 w-12 rounded-full bg-gray-300" />
          <h2 className="pt-2 text-lg font-bold text-gray-800">
            {filteredResorts.length}件のスキー場
          </h2>
        </button>
      </div>
    </main>
  );
}
