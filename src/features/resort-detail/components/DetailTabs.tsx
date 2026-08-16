"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Props<TTab extends string> = {
  tabs: readonly TTab[];
  activeTab: TTab;
  onTabChange: (tab: TTab) => void;
};

export const DetailTabs = <TTab extends string>({
  tabs,
  activeTab,
  onTabChange,
}: Props<TTab>) => (
  <Tabs
    value={activeTab}
    onValueChange={value => onTabChange(value as TTab)}
    className="sticky top-0 z-10 overflow-x-auto border-b border-gray-200 bg-white"
    orientation="horizontal"
  >
    <TabsList className="bg-transparent border-0 gap-0 h-auto p-0 flex">
      {tabs.map(tab => (
        <TabsTrigger
          key={tab}
          value={tab}
          className={cn(
            "flex-1 py-3.5 px-2 md:px-4 text-center rounded-none border-b-2 border-transparent text-gray-600 hover:bg-gray-50 hover:text-blue-700 transition-all duration-200",
            "text-sm md:text-base font-medium",
            "min-w-[80px] md:min-w-[96px]",
            "data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:font-bold data-[state=active]:bg-transparent",
            "after:hidden",
          )}
        >
          {tab}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);
