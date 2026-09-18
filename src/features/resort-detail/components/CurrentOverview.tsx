import { Clock3 } from "lucide-react";
import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import type { Resort } from "../types";
import { removeGeneratedCommentLinks } from "../utils/commentContent";
import {
  conditionText,
  hasSourceUrl,
  record,
  sourceUrls,
} from "../utils/currentConditions";
import { createFinalizedCourseGroups } from "../utils/detailMetrics";
import { createLiftStatusSummary } from "../utils/liftStatusSummary";
import { NotFetchedBadge, SourceLine } from "./CompactInfo";
import { ConditionTable } from "./ConditionTable";
import { CourseStatusTable } from "./CourseStatusTable";
import { ObservationTimes } from "./ObservationTimes";
import { ResortComment } from "./ResortComment";

/** 出典がないときは営業状況が分からないので、地図のコース数だけを「不明」として出す。 */
const createMapCourseSummary = (
  count: number | null,
): CourseStatusSummary | null =>
  count == null
    ? null
    : {
        total: count,
        open: 0,
        partial: 0,
        closed: 0,
        unknown: count,
        observedAt: null,
        sourceUrls: [],
        updates: [],
      };

export function CurrentOverview({
  resort,
  summaryOnly = false,
  onShowCourseDetail,
  onShowLiftDetail,
}: {
  resort: Resort;
  summaryOnly?: boolean;
  /** 渡すと、コース／リフトのブロックにそれぞれ「詳細」ボタンを出す */
  onShowCourseDetail?: () => void;
  onShowLiftDetail?: () => void;
}) {
  const courses = resort.finalizedMapData?.courses;
  const lifts = resort.finalizedMapData?.lifts;
  const courseStatus = resort.finalizedMapData?.courseStatusSummary;
  const conditions = resort.currentConditions ?? [];
  // 「未取得」は出典が1つも登録されていないこと。出典があって中身が空のときは
  // 取得はできているので、件数を「不明」として出す。
  const hasCourseSource = hasSourceUrl(
    courseStatus?.sourceUrls ?? courses?.sourceUrls,
  );
  const hasLiftSource = hasSourceUrl(lifts?.sourceUrls);
  const hasConditionSource = conditions.some(item =>
    hasSourceUrl(item.weather?.sourceUrls),
  );
  const courseSummary = hasCourseSource
    ? courseStatus
    : createMapCourseSummary(
        courses ? createFinalizedCourseGroups(courses.features).length : null,
      );
  const liftSummary = createLiftStatusSummary(lifts);
  const observationEntries = [
    ...(hasCourseSource
      ? [
          {
            label: "コース",
            time: courseStatus?.observedAt ?? courses?.observedAt,
          },
        ]
      : []),
    ...(hasLiftSource ? [{ label: "リフト", time: lifts?.observedAt }] : []),
    ...(summaryOnly ? [] : conditions)
      .filter(item => item.weather && hasSourceUrl(item.weather.sourceUrls))
      .map(item => ({ label: "天候", time: item.weather?.time })),
  ];
  return (
    <section aria-label="営業・気象情報" className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {!summaryOnly && (
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
            営業状況
          </h2>
        )}
        {observationEntries.length > 0 ? (
          <div
            className={`flex min-w-0 items-start gap-1.5 text-slate-600 ${summaryOnly ? "ml-auto" : ""}`}
          >
            <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <ObservationTimes align="left" entries={observationEntries} />
          </div>
        ) : (
          <NotFetchedBadge title="営業状況はまだ取得できていません" />
        )}
      </div>
      <div className={summaryOnly ? "grid grid-cols-2 gap-3" : "space-y-2"}>
        <div
          className={
            summaryOnly ? "min-w-0 border-r border-slate-200 pr-3" : "min-w-0"
          }
        >
          <CourseStatusTable
            summary={courseSummary}
            unavailable={!hasCourseSource}
            onShowDetail={onShowCourseDetail}
            source={
              hasCourseSource ? (
                <SourceLine
                  label="コース"
                  showLabel={false}
                  showFetched={false}
                  urls={courseStatus?.sourceUrls ?? courses?.sourceUrls}
                  updates={
                    courseStatus?.updates ??
                    courses?.features.map(c => c.properties.update ?? "")
                  }
                />
              ) : undefined
            }
          />
        </div>
        <div className="min-w-0">
          <CourseStatusTable
            summary={liftSummary}
            kind="lift"
            unavailable={!hasLiftSource}
            onShowDetail={onShowLiftDetail}
            source={
              hasLiftSource ? (
                <SourceLine
                  label="リフト"
                  showLabel={false}
                  showFetched={false}
                  urls={lifts?.sourceUrls}
                  updates={liftSummary?.updates}
                />
              ) : undefined
            }
          />
        </div>
      </div>
      {!summaryOnly && (
        <>
          <section aria-label="コンディション" className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h3 className="text-base font-semibold text-slate-900 sm:text-lg">
                コンディション
              </h3>
              {hasConditionSource ? (
                conditions.map(
                  item =>
                    item.weather && (
                      <div key={item.id} className="min-w-0">
                        <SourceLine
                          label="コンディション"
                          showFetched={false}
                          showLabel={false}
                          urls={item.weather.sourceUrls}
                          updates={Object.values(record(item.weather.data)).map(
                            point => conditionText(record(point).update) ?? "",
                          )}
                        />
                      </div>
                    ),
                )
              ) : (
                <NotFetchedBadge title="コンディションはまだ取得できていません" />
              )}
            </div>
            {conditions.some(item => item.weather) ? (
              conditions.map(
                item =>
                  item.weather && (
                    <ConditionTable key={item.id} data={item.weather.data} />
                  ),
              )
            ) : hasConditionSource ? (
              <p className="text-sm text-slate-700">
                コンディションの情報はありません。
              </p>
            ) : null}
          </section>
          {conditions.some(item => {
            const value = record(item.comment?.data).value;
            return (
              (typeof value === "string" &&
                conditionText(removeGeneratedCommentLinks(value, item.id))) ||
              sourceUrls(item.comment?.sourceUrls).length > 0
            );
          }) && (
            <section
              className="space-y-1.5 border-t border-slate-200 pt-2"
              aria-label="コメント"
            >
              <h3 className="text-base font-semibold text-slate-900 sm:text-lg">
                コメント
              </h3>
              {conditions.map(item => {
                const value = record(item.comment?.data).value;
                return item.comment ? (
                  <ResortComment
                    key={item.id}
                    html={typeof value === "string" ? value : ""}
                    resortId={item.id}
                    urls={item.comment?.sourceUrls ?? []}
                  />
                ) : null;
              })}
            </section>
          )}
        </>
      )}
    </section>
  );
}
