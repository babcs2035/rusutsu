"use client";

import { UnderlineTabs } from "@/shared/components/UnderlineTabs";

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
  <UnderlineTabs
    tabs={tabs}
    activeTab={activeTab}
    onTabChange={onTabChange}
    className="sticky top-0 z-10"
  />
);
