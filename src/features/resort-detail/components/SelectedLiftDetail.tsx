"use client";

import { useState } from "react";
import type { FinalizedLiftFeature } from "@/lib/finalizedResortGeojsonShared";
import {
  createElevationProfile,
  formatMeters,
  getElevationRange,
  LIFT_STATUS_DESCRIPTION,
  normalizeIconSymbol,
} from "../utils/detailMetrics";
import { getFeatureSearchWord } from "../utils/featureLinks";
import { collectFeatureMedia } from "../utils/featureMedia";
import { liftStatusSources } from "../utils/featureSources";
import { ElevationProfile } from "./ElevationProfile";
import {
  FeatureHeadline,
  FeatureMetrics,
  FeatureNotes,
} from "./FeatureHeadline";
import { FeatureMediaGallery } from "./FeatureMediaGallery";

export const SelectedLiftDetail = ({
  lift,
  resortLabelName,
  sourceUrls,
}: {
  lift: FinalizedLiftFeature;
  resortLabelName: string;
  sourceUrls: string[];
}) => {
  const [selectedPoint, setSelectedPoint] = useState<{
    liftId: string;
    distance: number;
  } | null>(null);
  const profilePoints = createElevationProfile(lift.coordinates);
  const statusSymbol = normalizeIconSymbol(lift.properties.status);
  const statusText = statusSymbol
    ? LIFT_STATUS_DESCRIPTION[statusSymbol]
    : null;
  // 営業状況のチップと同じ文言だけのメモは繰り返さない
  const toNotes = (value: string | null | undefined) =>
    [value?.trim()].filter(
      (note): note is string =>
        Boolean(note) &&
        note?.replace(/--:--/gu, "").replace(/[\s~〜～]/gu, "") !== statusText,
    );
  const comments = toNotes(lift.properties.latestNote);
  const descriptions = toNotes(lift.properties.note).filter(
    note => !comments.includes(note),
  );
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
    <div className="flex flex-col gap-3">
      <FeatureHeadline
        kind="lift"
        status={{
          symbol: statusSymbol,
          text: statusSymbol
            ? LIFT_STATUS_DESCRIPTION[statusSymbol]
            : "状況不明",
        }}
        searchWord={searchWord}
        sources={liftStatusSources(lift, sourceUrls)}
      />

      <FeatureMetrics
        items={[
          // 距離は地図から算出した値ではなく、公表されている distance を使う
          { title: "距離", value: formatMeters(lift.properties.distance) },
          {
            title: "標高差",
            value: formatMeters(elevationDiff),
            detail: elevationRange
              ? `${Math.round(elevationRange.max)} - ${Math.round(elevationRange.min)}m`
              : null,
          },
          {
            title: "定員",
            value:
              lift.properties.capacity == null
                ? "--"
                : `${lift.properties.capacity}名`,
          },
          { title: "フード", value: lift.properties.hood ?? "--" },
        ]}
      />

      <FeatureNotes
        comments={comments}
        descriptions={descriptions}
        descriptionLabel="リフト紹介"
      />

      <ElevationProfile
        points={profilePoints}
        activeDistance={
          selectedPoint?.liftId === lift.id ? selectedPoint.distance : 0
        }
        onPointSelect={point =>
          setSelectedPoint({ liftId: lift.id, distance: point.distance })
        }
      />

      <FeatureMediaGallery
        media={collectFeatureMedia([lift.properties])}
        name={lift.name}
      />
    </div>
  );
};
