"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  initialRegionExpansion,
  type ResortRegion,
} from "../utils/groupResortsByRegion";

const toggle = (names: Set<string>, name: string, open: boolean) => {
  const next = new Set(names);
  if (open) next.add(name);
  else next.delete(name);
  return next;
};

const toSets = <T,>(regions: ResortRegion<T>[]) => {
  const initial = initialRegionExpansion(regions);
  return {
    regions: new Set(initial.regions),
    prefectures: new Set(initial.prefectures),
  };
};

/**
 * 地方（36px の帯）→ 都道府県（32px・青い縦線の行）→ スキー場の3段。
 * 見出しはどちらも text-sm 太字に揃え、大きさではなく帯と縦線で階層を分ける。
 * スクロール中は地方と都道府県を一覧の上端から2段で固定する。
 * 開閉は検索結果（resultKey）が変わるたびに initialRegionExpansion の既定へ戻し、
 * それまでは利用者が開け閉めした状態を保つ。
 */
export function GroupedResortList<T>({
  regions,
  resultKey,
  renderResort,
}: {
  regions: ResortRegion<T>[];
  /** 検索結果の顔ぶれ。並び順や稼働状況の更新では変えない */
  resultKey: string;
  renderResort: (resort: T) => ReactNode;
}) {
  const [expansion, setExpansion] = useState(() => ({
    key: resultKey,
    ...toSets(regions),
  }));
  if (expansion.key !== resultKey) {
    setExpansion({ key: resultKey, ...toSets(regions) });
  }
  return regions.map(region => (
    <li key={region.name} data-resort-region={region.name} className="mb-1">
      <Collapsible
        className="relative"
        open={expansion.regions.has(region.name)}
        onOpenChange={open =>
          setExpansion(current => ({
            ...current,
            regions: toggle(current.regions, region.name, open),
          }))
        }
      >
        <div className="sticky top-0 z-20 bg-white">
          <CollapsibleTrigger className="group flex h-9 w-full items-center gap-1.5 rounded-md bg-slate-100 px-2 text-left text-sm font-bold text-slate-800 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30">
            <ChevronRight className="size-4 shrink-0 transition-transform group-aria-expanded:rotate-90 motion-reduce:transition-none" />
            <span className="min-w-0 flex-1 truncate">{region.name}</span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
              {region.count.toLocaleString("ja-JP")}件
            </span>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="overflow-visible">
          <ul className="list-none">
            {region.prefectures.map(prefecture => (
              <li
                key={prefecture.name}
                data-resort-prefecture={prefecture.name}
              >
                <Collapsible
                  className="relative"
                  open={expansion.prefectures.has(prefecture.name)}
                  onOpenChange={open =>
                    setExpansion(current => ({
                      ...current,
                      prefectures: toggle(
                        current.prefectures,
                        prefecture.name,
                        open,
                      ),
                    }))
                  }
                >
                  <div className="sticky top-9 z-10 bg-white">
                    <CollapsibleTrigger className="group flex h-8 w-full items-center gap-1.5 border-b border-gray-200 border-l-4 border-l-sky-300 bg-white pr-2 pl-2 text-left text-sm font-bold text-gray-900 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 aria-expanded:border-l-sky-600 aria-expanded:bg-sky-200 aria-expanded:hover:bg-sky-300">
                      <ChevronRight className="size-3.5 shrink-0 text-gray-500 transition-transform group-aria-expanded:rotate-90 motion-reduce:transition-none" />
                      <span className="min-w-0 flex-1 truncate">
                        {prefecture.name}
                      </span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-500">
                        {prefecture.resorts.length.toLocaleString("ja-JP")}件
                      </span>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="overflow-visible">
                    <ul className="mb-1 list-none space-y-1 border-l-4 border-l-sky-600 py-1 pl-2 [&_[data-ski-resort-list-item]]:scroll-mt-[4.25rem] [&_[data-ski-resort-list-item]]:md:px-3">
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
