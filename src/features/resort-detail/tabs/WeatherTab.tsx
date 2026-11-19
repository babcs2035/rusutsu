"use client";

import { useMemo, useState } from "react";
import {
  getSnowForecastLinks,
  useWeatherLinks,
} from "@/features/weather/useWeatherLinks";
import { SnowForecastEmbed } from "@/features/weather/WeatherChart";
import { WeatherLinkChips } from "@/features/weather/WeatherLinkChips";
import { ResortTabs } from "../components/ResortTabs";
import { useSimultaneousView } from "../components/SimultaneousToggle";
import type { Resort } from "../types";

type WeatherMember = Pick<
  Resort,
  "id" | "nameJa" | "shortName" | "weatherIds" | "latitude" | "longitude"
> & { label?: string };

/** 「〇〇も同時に表示」中に、天気を切り替えて見るスキー場。最初は開いたスキー場 */
const useWeatherMembers = (resort: Resort): WeatherMember[] => {
  const { active, partners } = useSimultaneousView(resort);
  if (!partners.length) return [];
  return [resort, ...partners].map(member => ({
    ...member,
    label: active?.memberLabels[member.id],
  }));
};

export const WeatherTab = ({ resort }: { resort: Resort }) => {
  const members = useWeatherMembers(resort);
  const [selectedId, setSelectedId] = useState(resort.id);
  const activeMember = members.find(member => member.id === selectedId) ?? null;
  const shown = activeMember ?? resort;
  const links = useWeatherLinks(shown, "mid");
  const snowForecastLinks = useMemo(() => getSnowForecastLinks(shown), [shown]);

  return (
    <div className="flex flex-col gap-3">
      {members.length > 1 && (
        <ResortTabs
          members={members}
          activeId={activeMember?.id ?? resort.id}
          onChange={setSelectedId}
          label="天気を見るスキー場"
        />
      )}
      {/* 比較の天気カードと同じ並び。リンクの行の下に、地点ごとの予報 */}
      <section className="flex min-w-0 flex-col gap-2">
        <WeatherLinkChips links={links} />
        {snowForecastLinks.map(link => (
          <div key={link.id} className="flex min-w-0 flex-col gap-1">
            {snowForecastLinks.length > 1 && (
              <h3 className="text-sm text-gray-900 font-semibold font-[var(--font-heading)]">
                {link.displayName}
              </h3>
            )}
            <SnowForecastEmbed
              snowForecastSlug={link.id}
              resortName={shown.nameJa}
            />
          </div>
        ))}
      </section>
    </div>
  );
};
