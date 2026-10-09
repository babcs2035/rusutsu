"use client";

import { type ReactNode, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimilarCourses } from "@/features/course-recommendations/SimilarCourses";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import useMediaQuery from "@/hooks/use-media-query";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
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
  resortId?: string;
  mapData?: FinalizedResortMapData | null;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
};

export const SelectedCourseDetail = ({
  courseGroup,
  resortLabelName,
  sourceUrls,
  resortId,
  mapData,
  selectedElevationProfilePoint,
  onSelectedElevationProfilePointChange,
}: Props) => {
  const [isMobile] = useMediaQuery("(max-width: 767px)");
  const figuresRef = useRef<HTMLDivElement>(null);
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
  const notesContent = (
    <FeatureNotes comments={comments} descriptions={notes.description} />
  );
  const profile = (
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
  );
  const media = (
    <div className="empty:hidden">
      <FeatureMediaGallery
        media={collectFeatureMedia(
          courseGroup.courses.map(course => course.properties),
        )}
        name={courseGroup.displayName}
      />
    </div>
  );
  const renderFigures = (similarCourses: ReactNode, count: number | null) => {
    if (isMobile && similarCourses) {
      return (
        <Tabs
          ref={figuresRef}
          defaultValue="profile"
          className="flex-col gap-2"
          onValueChange={() => {
            const figures = figuresRef.current;
            if (!figures) return;
            let scroller = figures.parentElement;
            while (
              scroller &&
              !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)
            ) {
              scroller = scroller.parentElement;
            }
            if (!scroller) return;
            // 読み進めてから切り替えた場合も、新しい内容の先頭を見せる。
            const offset =
              figures.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top -
              scroller.clientTop -
              Number.parseFloat(getComputedStyle(scroller).paddingTop);
            if (offset < 0) scroller.scrollTop += offset;
          }}
        >
          <TabsList
            variant="line"
            aria-label="コース詳細の表示"
            className="sticky top-0 z-10 h-9 w-full shrink-0 rounded-none border-b border-gray-200 bg-white p-0"
          >
            <TabsTrigger
              value="profile"
              className="h-9 rounded-none border-0 border-b-2 border-transparent text-[13px] after:hidden data-active:border-blue-600 data-active:font-bold data-active:text-blue-600"
            >
              断面図
            </TabsTrigger>
            <TabsTrigger
              value="similar"
              className="h-9 rounded-none border-0 border-b-2 border-transparent text-[13px] after:hidden data-active:border-blue-600 data-active:font-bold data-active:text-blue-600"
            >
              類似コース{count == null ? "" : `（${count}）`}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile" keepMounted>
            {profilePoints.length >= 2 ? (
              profile
            ) : (
              <p className="text-xs text-slate-500">
                断面図のデータがありません。
              </p>
            )}
          </TabsContent>
          <TabsContent value="similar" keepMounted>
            {similarCourses}
          </TabsContent>
          {notesContent}
          {media}
        </Tabs>
      );
    }
    return (
      <>
        {!isMobile && notesContent}
        {similarCourses}
        {profile}
        {isMobile && notesContent}
        {media}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-2 md:gap-3">
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

      {resortId ? (
        <SimilarCourses
          resortId={resortId}
          resortName={resortLabelName}
          courseGroup={courseGroup}
          mapData={mapData}
          showHeading={!isMobile}
        >
          {renderFigures}
        </SimilarCourses>
      ) : (
        renderFigures(null, null)
      )}
    </div>
  );
};
