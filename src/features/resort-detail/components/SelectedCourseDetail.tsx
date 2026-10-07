"use client";

import type { ReactNode } from "react";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import type { FinalizedCourseGroup } from "../types";
import {
  COURSE_STATUS_DESCRIPTION,
  createConnectedCourseElevationProfile,
  getCourseGroupMetricItems,
  getCourseGroupNotes,
  getCourseGroupPisteSymbol,
  getCourseGroupStatus,
  PISTE_STATUS_DESCRIPTION,
} from "../utils/detailMetrics";
import { getFeatureSearchWord } from "../utils/featureLinks";
import { collectFeatureMedia } from "../utils/featureMedia";
import { courseStatusSources } from "../utils/featureSources";
import { ElevationProfile } from "./ElevationProfile";
import {
  FeatureHeadline,
  FeatureMetrics,
  FeatureNotes,
} from "./FeatureHeadline";
import { FeatureMediaGallery } from "./FeatureMediaGallery";

type Props = {
  courseGroup: FinalizedCourseGroup;
  resortLabelName: string;
  sourceUrls: string[];
  similarCourses?: ReactNode;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
};

export const SelectedCourseDetail = ({
  courseGroup,
  resortLabelName,
  sourceUrls,
  similarCourses,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
}: Props) => {
  const selectedCourse = courseGroup.courses[0];

  if (!selectedCourse) return null;

  const status = getCourseGroupStatus(courseGroup);
  const pisteSymbol = getCourseGroupPisteSymbol(courseGroup);

  const profilePoints = createConnectedCourseElevationProfile(
    courseGroup.courses,
  );
  const notes = getCourseGroupNotes(courseGroup);
  // 一部だけオープンしている場合の「下部のみオープン」も当日の状況として扱う
  const repeatedLabels = new Set([
    status.symbol ? COURSE_STATUS_DESCRIPTION[status.symbol] : "",
    pisteSymbol ? PISTE_STATUS_DESCRIPTION[pisteSymbol] : "",
    ...(status.symbol === "×" ? ["閉鎖中", "滑走不可", "CLOSE", "CLOSED"] : []),
  ]);
  const comments = [
    ...new Set([...(status.note ? [status.note] : []), ...notes.latest]),
  ].filter(comment => !repeatedLabels.has(comment.trim()));
  const searchWord = getFeatureSearchWord({
    searchWord: selectedCourse.properties.searchWord,
    resortLabelName,
    featureName: courseGroup.displayName,
  });

  return (
    <div className="flex flex-col gap-3">
      <FeatureHeadline
        kind="course"
        status={{
          symbol: status.symbol,
          text: status.symbol
            ? COURSE_STATUS_DESCRIPTION[status.symbol]
            : "状況不明",
        }}
        searchWord={searchWord}
        sources={courseStatusSources(courseGroup, sourceUrls)}
      />

      <FeatureMetrics items={getCourseGroupMetricItems(courseGroup)} />

      <FeatureNotes comments={comments} descriptions={notes.description} />

      {/* PC は類似コースを断面図より上に出す */}
      <div className="md:order-2">
        <ElevationProfile
          points={profilePoints}
          activeDistance={
            selectedElevationProfilePoint?.courseGroupId === courseGroup.id
              ? selectedElevationProfilePoint.distance
              : null
          }
          onPointSelect={point =>
            onSelectedElevationProfilePointChange({
              courseGroupId: courseGroup.id,
              courseName: courseGroup.displayName,
              coordinate: point.coordinate,
              distance: point.distance,
              elevation: point.elevation,
              slope: point.slope,
            })
          }
        />
      </div>

      {similarCourses && <div className="md:order-1">{similarCourses}</div>}

      <div className="empty:hidden md:order-3">
        <FeatureMediaGallery
          media={collectFeatureMedia(
            courseGroup.courses.map(course => course.properties),
          )}
          name={courseGroup.displayName}
        />
      </div>
    </div>
  );
};
