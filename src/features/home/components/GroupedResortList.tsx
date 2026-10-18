"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ResortRegion } from "../utils/groupResortsByRegion";

export function GroupedResortList<T>({
  regions,
  renderResort,
}: {
  regions: ResortRegion<T>[];
  renderResort: (resort: T) => ReactNode;
}) {
  return regions.map(region => (
    <li key={region.name} data-resort-region={region.name} className="mb-1">
      <Collapsible className="relative">
        <div className="sticky top-0 z-20 bg-white">
          <CollapsibleTrigger className="group flex h-10 w-full items-center gap-1.5 rounded-lg bg-gray-50 px-2 text-left text-base font-bold text-gray-900 shadow-sm hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 @min-[400px]/resort-list:text-lg">
            <ChevronRight className="size-4 shrink-0 transition-transform group-aria-expanded:rotate-90 motion-reduce:transition-none" />
            <span className="min-w-0 flex-1">{region.name}</span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-gray-500">
              （
              <span className="text-base font-bold @min-[400px]/resort-list:text-lg">
                {region.count}
              </span>
              ）
            </span>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="overflow-visible">
          <ul className="list-none border-l border-sky-100 pl-1.5">
            {region.prefectures.map(prefecture => (
              <li
                key={prefecture.name}
                data-resort-prefecture={prefecture.name}
              >
                <Collapsible className="relative">
                  <div className="sticky top-10 z-10 bg-white">
                    <CollapsibleTrigger className="group flex h-9 w-full items-center gap-1.5 rounded-lg bg-white px-2 text-left text-[15px] font-bold text-gray-900 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 @min-[400px]/resort-list:text-base">
                      <ChevronRight className="size-3.5 shrink-0 transition-transform group-aria-expanded:rotate-90 motion-reduce:transition-none" />
                      <span>{prefecture.name}</span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-gray-500">
                        （
                        <span className="text-base font-bold @min-[400px]/resort-list:text-lg">
                          {prefecture.resorts.length}
                        </span>
                        ）
                      </span>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="overflow-visible">
                    <ul className="list-none space-y-1 py-1 pl-1.5 [&_[data-ski-resort-list-item]]:scroll-mt-[4.75rem] [&_[data-ski-resort-list-item]]:md:px-3">
                      {prefecture.resorts.map(renderResort)}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  ));
}
