"use client";

import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { useAppLink } from "@/shared/hooks/useAppLink";
import type { WeatherLink } from "./useWeatherLinks";
import "./WeatherLinkChips.css";

const WEATHER_LINK_SLOTS: { kind: WeatherLink["kind"]; label: string }[] = [
  { kind: "snowForecast", label: "Snow Forecast" },
  { kind: "tenkiJp", label: "tenki.jp" },
  { kind: "weathernews", label: "ウェザーニュース" },
  { kind: "windy", label: "Windy" },
];

/**
 * 天気サイトへのリンクの行（詳細・比較で共通）。
 * 各サイト1件ずつなら横1列。欠けたサイトの分は右端で場所だけ取り、
 * ボタンの大きさを4サイトそろったスキー場と同じにする。
 * 同じサイトに複数地点があるときだけ折り返す。
 */
export const WeatherLinkChips = ({
  links,
  className,
}: {
  links: WeatherLink[];
  className?: string;
}) => {
  const availableLinks = links.filter(
    (link): link is WeatherLink & { url: string } => Boolean(link.url),
  );
  if (availableLinks.length === 0) return null;
  const hasMultipleLinks =
    new Set(availableLinks.map(link => link.kind)).size < availableLinks.length;
  const missingLinkSlots = hasMultipleLinks
    ? []
    : WEATHER_LINK_SLOTS.filter(
        slot => !availableLinks.some(link => link.kind === slot.kind),
      );

  return (
    <div className={cn("weather-links-container min-w-0", className)}>
      <div
        className={cn(
          "weather-links flex gap-1",
          hasMultipleLinks && "weather-links-multiple",
        )}
      >
        {availableLinks.map(link => (
          <WeatherLinkChip key={`${link.kind}-${link.id}`} link={link} />
        ))}
        {missingLinkSlots.map(slot => (
          <span
            key={slot.kind}
            aria-hidden="true"
            className="weather-link invisible flex items-center justify-center text-xs font-extrabold"
          >
            <span className="whitespace-nowrap">{slot.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/** 天気サイト1件のボタン。Windy はスマホならアプリで開く */
const WeatherLinkChip = ({ link }: { link: WeatherLink & { url: string } }) => {
  const appLink = useAppLink(link.url);
  return (
    <ExternalLinkComponent
      {...appLink}
      className={cn(
        "weather-link",
        "flex items-center justify-center rounded-md text-xs font-extrabold text-center",
        "transition-colors duration-150",
        link.bg,
        link.hoverBg,
        link.color,
      )}
    >
      <span className="whitespace-nowrap">{link.label}</span>
    </ExternalLinkComponent>
  );
};
