"use client";

import { CorrectionLink } from "@/features/corrections/CorrectionLink";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import type { FinalizedLiftFeature } from "@/lib/finalizedResortGeojsonShared";
import {
  createLiftElevationProfile,
  formatElevationRange,
  formatMeters,
  getLiftElevationRange,
  LIFT_STATUS_DESCRIPTION,
  normalizeIconSymbol,
} from "../utils/detailMetrics";
import { getFeatureSearchWord } from "../utils/featureLinks";
import { collectFeatureMedia } from "../utils/featureMedia";
import { liftStatusSources } from "../utils/featureSources";
import { ElevationProfile } from "./ElevationProfile";
import { FeatureHeadline, FeatureNotes } from "./FeatureHeadline";
import { FeatureMediaGallery } from "./FeatureMediaGallery";
import { LiftMetrics } from "./LiftMetrics";

export const SelectedLiftDetail = ({
  lift,
  resortId,
  resortLabelName,
  sourceUrls,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
}: {
  lift: FinalizedLiftFeature;
  resortId?: string;
  resortLabelName: string;
  sourceUrls: string[];
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
}) => {
  const profilePoints = createLiftElevationProfile(lift.coordinates);
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
  const coordinateElevationRange = getLiftElevationRange(lift.coordinates);
  const elevationRange =
    coordinateElevationRange ??
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
  const properties = lift.properties;
  const specifications = [
    {
      title: "油よけカバー",
      titleParts: ["油よけ", "カバー"],
      value: properties.oilShield,
    },
    {
      title: "フットレスト",
      titleParts: ["フット", "レスト"],
      value: properties.footrest,
    },
    {
      title: "支柱数",
      value: properties.towers == null ? null : String(properties.towers),
    },
    { title: "信号", value: properties.signal },
    {
      title: "索道メーカー",
      titleParts: ["索道", "メーカー"],
      width: "wide" as const,
      value: properties.maker,
    },
    {
      title: "設置年",
      value: properties.year == null ? null : `${properties.year}年`,
    },
  ].flatMap(item => {
    const value = item.value?.trim();
    return value ? [{ ...item, value }] : [];
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
        reportContext={
          resortId ? { resortId, targetIds: [lift.id] } : undefined
        }
      />
      {resortId && (
        <CorrectionLink
          resortId={resortId}
          context={{ kind: "lift", targetKind: "lift", targetId: lift.id }}
        />
      )}

      <LiftMetrics
        key={lift.id}
        items={[
          // 公表距離を優先し、未取得のときだけGeoJSONの斜面距離を使う。
          {
            title: "距離",
            value: formatMeters(properties.distance ?? properties.slopeDistMap),
          },
          {
            title: "標高差",
            width: "wide",
            value: formatMeters(elevationDiff),
            detail: formatElevationRange(coordinateElevationRange),
          },
          {
            title: "定員",
            value:
              lift.properties.capacity == null
                ? "--"
                : `${lift.properties.capacity}名`,
          },
          ...[
            { title: "フード", value: properties.hood },
            { title: "早朝", value: properties.morning },
            { title: "ナイター", value: properties.night },
          ].flatMap(item => {
            const value = item.value?.trim();
            return value ? [{ title: item.title, value }] : [];
          }),
        ]}
        specifications={specifications}
      />

      <FeatureNotes
        comments={comments}
        descriptions={descriptions}
        descriptionLabel="リフト紹介"
      />

      <ElevationProfile
        kind="lift"
        points={profilePoints}
        activeDistance={
          selectedElevationProfilePoint?.liftId === lift.id
            ? selectedElevationProfilePoint.distance
            : 0
        }
        onPointSelect={point =>
          onSelectedElevationProfilePointChange({
            liftId: lift.id,
            courseName: lift.name,
            coordinate: point.coordinate,
            distance: point.distance,
            elevation: point.elevation,
            slope: point.slope,
          })
        }
      />

      <FeatureMediaGallery
        media={collectFeatureMedia([lift.properties])}
        name={lift.name}
      />
    </div>
  );
};
