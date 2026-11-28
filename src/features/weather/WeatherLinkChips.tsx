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

const WEATHER_LINK_SHORT_LABELS: Record<WeatherLink["kind"], string> = {
  snowForecast: "Snow",
  tenkiJp: "tenki.jp",
  weathernews: "天気",
  windy: "Windy",
};

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
          !hasMultipleLinks && "weather-links-single",
        )}
      >
        {availableLinks.map(link => (
          <WeatherLinkChip
            key={`${link.kind}-${link.id}`}
            link={link}
            compactLabel={!hasMultipleLinks}
          />
        ))}
        {missingLinkSlots.map(slot => (
          <span
            key={slot.kind}
            aria-hidden="true"
            className="weather-link invisible flex items-center justify-center text-xs font-semibold"
          >
            <span className="whitespace-nowrap">{slot.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/** 天気サイト1件のボタン。Windy はスマホならアプリで開く */
const WeatherLinkChip = ({
  link,
  compactLabel,
}: {
  link: WeatherLink & { url: string };
  compactLabel: boolean;
}) => {
  const appLink = useAppLink(link.url);
  return (
    <ExternalLinkComponent
      {...appLink}
      aria-label={link.label}
      className={cn(
        "weather-link",
        "flex items-center justify-center rounded-md border border-border bg-background text-center font-semibold text-primary transition-colors hover:bg-muted",
      )}
    >
      {compactLabel ? (
        <>
          <span className="weather-link-label-full whitespace-nowrap">
            {link.label}
          </span>
          <span className="weather-link-label-short whitespace-nowrap">
            {WEATHER_LINK_SHORT_LABELS[link.kind]}
          </span>
        </>
      ) : (
        <span className="break-words">{link.label}</span>
      )}
    </ExternalLinkComponent>
  );
};
