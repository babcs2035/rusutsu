"use client";

import { Portal } from "@radix-ui/react-portal";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LiftTicketSearchInput } from "@/features/lift-ticket/types";
import { useBreakpointValue } from "@/hooks/use-breakpoint-value";
import { AnimatedPanel } from "@/shared/components/AnimatedPanel";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { CompareLiftTicketTab } from "./compare/CompareLiftTicketTab";
import { CompareOverviewTab } from "./compare/CompareOverviewTab";
import { CompareReviewsTab } from "./compare/CompareReviewsTab";
import { CompareWeatherTab } from "./compare/CompareWeatherTab";
import type { Resort } from "./compare/types";

type Props = {
  resorts: Resort[];
  isLoading: boolean;
  onClose: () => void;
  presentation?: "sheet" | "inline";
  canScrollContent?: boolean;
  initialLiftTicketInput: LiftTicketSearchInput;
};

const TABS = ["概要", "料金", "レビュー", "天候"] as const;

export const SkiResortCompareView = ({
  resorts,
  isLoading,
  onClose,
  presentation = "sheet",
  canScrollContent,
  initialLiftTicketInput,
}: Props) => {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("概要");
  const isSidePanel = useBreakpointValue({ base: false, md: true }) ?? false;
  const isSheetContentScrollable = canScrollContent ?? isSidePanel;

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const comparePanelContent = (
    <div
      className={`flex-1 flex flex-col ${isSheetContentScrollable ? "overflow-y-auto" : "overflow-y-hidden"}`}
    >
      <Button
        variant="ghost"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 min-w-0 p-0 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10"
        aria-label="比較画面を閉じる"
      >
        <X size={18} strokeWidth={2.5} />
      </Button>

      <div className="px-4 md:px-8 pt-6 md:pt-8 pb-5 border-b border-gray-200">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 font-[var(--font-heading)]">
          スキー場比較
        </h1>
        <p className="mt-2 text-sm font-medium text-gray-500">
          {resorts.length} 件を比較中
        </p>
      </div>

      {/* Tabs ベースクラスは flex row であるため，
          タブバー上・コンテンツ下の縦積みはここで明示する
          （base-ui は data-orientation 属性のみを付与するため，
          orientation 別バリアントは共有コンポーネント側で不使用，SUG-9 参照） */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full scrollable-tabs flex-col"
      >
        <TabsList className="flex border-b border-gray-100 bg-white rounded-none h-auto">
          {TABS.map(tab => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="flex-1 py-4 text-center text-sm md:text-base font-medium bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:font-bold [&_span]:truncate"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="概要">
          {isLoading ? (
            <div className="min-h-96 flex items-center justify-center">
              <LoadingSpinner text="比較データを読み込み中..." />
            </div>
          ) : (
            <CompareOverviewTab resorts={resorts} />
          )}
        </TabsContent>
        <TabsContent value="料金">
          {isLoading ? (
            <div className="min-h-96 flex items-center justify-center">
              <LoadingSpinner text="比較データを読み込み中..." />
            </div>
          ) : (
            <CompareLiftTicketTab
              resorts={resorts}
              initialInput={initialLiftTicketInput}
            />
          )}
        </TabsContent>
        <TabsContent value="レビュー">
          {isLoading ? (
            <div className="min-h-96 flex items-center justify-center">
              <LoadingSpinner text="比較データを読み込み中..." />
            </div>
          ) : (
            <CompareReviewsTab resorts={resorts} />
          )}
        </TabsContent>
        <TabsContent value="天候">
          {isLoading ? (
            <div className="min-h-96 flex items-center justify-center">
              <LoadingSpinner text="比較データを読み込み中..." />
            </div>
          ) : (
            <CompareWeatherTab resorts={resorts} isSidePanel={isSidePanel} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  if (presentation === "inline") {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white">
        {comparePanelContent}
      </div>
    );
  }

  // モバイルの比較表示は presentation="inline"（MobileResultsSheet）で描画されるため，
  // このコンポーネントの sheet 表示はデスクトップ側パネルのみ．
  // 旧: vaul ボトムシート分支（z-[200]）があったが，描画経路が inline 化されて
  // 到達不能になったため削除（初回レンダでのみ描画される 1 フレームのちらつきも解消）
  return (
    isSidePanel && (
      <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-end p-0 pointer-events-none">
          <div
            className="absolute inset-0 backdrop-none bg-transparent"
            aria-hidden="true"
          />
          <AnimatedPanel
            data-ski-resort-compare-panel="true"
            visible={isSidePanel}
            contentClassName="relative z-10 flex h-full w-[min(800px,70vw)] flex-col overflow-hidden bg-white border border-gray-200 shadow-2xl pointer-events-auto"
          >
            {comparePanelContent}
          </AnimatedPanel>
        </div>
      </Portal>
    )
  );
};
