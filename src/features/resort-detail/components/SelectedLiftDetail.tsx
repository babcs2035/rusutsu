"use client";

import type { FinalizedLiftFeature } from "@/lib/finalizedResortGeojsonShared";
import {
  createElevationProfile,
  formatMeters,
  getElevationRange,
  LIFT_STATUS_DESCRIPTION,
  normalizeIconSymbol,
  type StatusSymbol,
} from "../utils/detailMetrics";
import { getFeatureSearchWord } from "../utils/featureLinks";
import { ElevationProfile } from "./ElevationProfile";
import { FeatureHeadline, FeatureMetric } from "./FeatureHeadline";

const SYMBOL_TONE: Record<StatusSymbol, "open" | "limited" | "closed"> = {
  "○": "open",
  "△": "limited",
  "×": "closed",
};

export const SelectedLiftDetail = ({
  lift,
  resortLabelName,
  sourceUrls,
}: {
  lift: FinalizedLiftFeature;
  resortLabelName: string;
  sourceUrls: string[];
}) => {
  const profilePoints = createElevationProfile(lift.coordinates);
  const statusSymbol = normalizeIconSymbol(lift.properties.status);
  const comments = [
    ...new Set(
      [lift.properties.latestNote, lift.properties.note]
        .filter((value): value is string => Boolean(value?.trim()))
        .map(value => value.trim()),
    ),
  ];
  const elevationRange =
    getElevationRange([lift.coordinates]) ??
    (lift.properties.top != null && lift.properties.bottom != null
      ? { min: lift.properties.bottom, max: lift.properties.top }
      : null);
  const elevationDiff = elevationRange
    ? elevationRange.max - elevationRange.min
    : lift.properties.vertical;
  const searchWord = getFeatureSearchWord({
    searchWord: lift.properties.searchWord,
    resortLabelName,
    featureName: lift.name,
  });

  return (
    <div className="flex flex-col gap-5">
      <FeatureHeadline
        items={[
          {
            label: "運行状況",
            text: statusSymbol ? LIFT_STATUS_DESCRIPTION[statusSymbol] : "不明",
            tone: statusSymbol ? SYMBOL_TONE[statusSymbol] : null,
          },
          { label: "種別", text: lift.properties.type ?? "リフト" },
          ...(lift.properties.speed
            ? [{ label: "速度", text: lift.properties.speed }]
            : []),
        ]}
        update={lift.properties.update}
        searchWord={searchWord}
        sourceUrls={sourceUrls}
      />

      <ElevationProfile points={profilePoints} />

      <div className="grid grid-cols-4 gap-2">
        {/* 距離は地図から算出した値ではなく、公表されている distance を使う */}
        <FeatureMetric
          title="距離"
          value={formatMeters(lift.properties.distance)}
        />
        <FeatureMetric
          title="標高差"
          value={formatMeters(elevationDiff)}
          detail={
            elevationRange
              ? `${Math.round(elevationRange.max)} - ${Math.round(elevationRange.min)}m`
              : null
          }
        />
        <FeatureMetric
          title="定員"
          value={
            lift.properties.capacity == null
              ? "--"
              : `${lift.properties.capacity}名`
          }
        />
        <FeatureMetric title="フード" value={lift.properties.hood ?? "--"} />
      </div>

      {comments.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500">コメント</p>
          <ul className="mt-1 flex flex-col gap-1">
            {comments.map(comment => (
              <li
                key={comment}
                className="text-sm leading-relaxed text-gray-800"
              >
                {comment}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
