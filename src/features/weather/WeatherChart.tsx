"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";

type Elevation = "top" | "mid" | "bot";

export const SnowForecastEmbed = ({
  snowForecastSlug,
  resortName,
}: {
  snowForecastSlug: string;
  resortName: string;
}) => {
  const [elevation, setElevation] = useState<Elevation>("mid");
  const feedUrl = `https://ja.snow-forecast.com/resorts/${snowForecastSlug}/forecasts/feed/${elevation}/m`;
  const detailUrl = `https://ja.snow-forecast.com/resorts/${snowForecastSlug}/6day/${elevation}`;

  return (
    <div>
      <ElevationSelector
        value={elevation}
        onChange={value => setElevation(value as Elevation)}
        options={[
          { label: "山頂", value: "top" },
          { label: "中腹", value: "mid" },
          { label: "山麓", value: "bot" },
        ]}
      />
      <Card className="mt-4 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto overflow-y-hidden scroll-touch">
            <iframe
              title={`${resortName} Snow-Forecast`}
              src={feedUrl}
              width="100%"
              height={260}
              scrolling="auto"
              loading="lazy"
              className="min-w-[720px] block border-0 bg-transparent"
            />
          </div>

          <Separator className="border-gray-100" />
          <div className="px-4 py-3">
            <p className="text-sm text-gray-600">
              詳細な予報は{" "}
              <ExternalLinkComponent
                href={detailUrl}
                className="text-blue-600 hover:text-blue-700"
              >
                snow-forecast.com
              </ExternalLinkComponent>{" "}
              からご確認ください
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * 標高を選択するための共通UIコンポーネント
 */
const ElevationSelector = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) => (
  <div className="flex w-full justify-center">
    <div className="flex gap-1 rounded-full bg-gray-100 border border-gray-200 p-1 shadow-sm">
      {options.map(option => (
        <Button
          key={option.value}
          onClick={() => onChange(option.value)}
          size="sm"
          variant={value === option.value ? "default" : "ghost"}
          className={cn(
            "rounded-full font-semibold transition-all duration-200 w-auto min-w-[5rem] md:min-w-[6rem]",
            value !== option.value &&
              "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
          )}
        >
          {option.label}
        </Button>
      ))}
    </div>
  </div>
);
