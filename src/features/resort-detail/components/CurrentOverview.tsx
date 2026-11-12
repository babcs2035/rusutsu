import { ExternalLink } from "lucide-react";
import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import type { ResortOperationStatus } from "@/server/ski-resorts/detail";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { Resort } from "../types";
import { removeGeneratedCommentLinks } from "../utils/commentContent";
import { createCourseDistance } from "../utils/courseChartColumns";
import { createMapCourseStatusSummary } from "../utils/courseStatusSummary";
import {
  conditionText,
  hasSourceUrl,
  record,
  sourceUrls,
} from "../utils/currentConditions";
import { createLiftStatusSummary } from "../utils/liftStatusSummary";
import { formatOperationDate } from "../utils/operationDates";
import { NotFetchedBadge, SourceLine } from "./CompactInfo";
import { ConditionTable } from "./ConditionTable";
import { CourseStatusTable } from "./CourseStatusTable";
import { ObservationTimes } from "./ObservationTimes";
import { ResortComment } from "./ResortComment";
import { useSimultaneousView } from "./SimultaneousToggle";

/** 出典がないときは営業状況が分からないので、地図のコース数だけを「不明」として出す。 */
export const createMapCourseSummary = (
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

const createResortOperationStatusFromMap = (
  mapData: NonNullable<Resort["finalizedMapData"]>,
): ResortOperationStatus => ({
  courses: createMapCourseStatusSummary(mapData.courses),
  lifts: createLiftStatusSummary(mapData.lifts),
  courseSourceUrls: mapData.courses?.sourceUrls ?? [],
  liftSourceUrls: mapData.lifts?.sourceUrls ?? [],
  courseObservedAt: mapData.courses?.observedAt ?? null,
  liftObservedAt: mapData.lifts?.observedAt ?? null,
  courseSourceLabels: mapData.courseStatusSummary?.sourceLabels,
  courseUpdates:
    mapData.courses?.features.map(c => c.properties.update ?? "") ?? [],
  courseDistance: createCourseDistance(mapData.courses),
});

export function CurrentOverview({
  resort,
  summaryOnly = false,
  onShowCourseDetail,
  onShowLiftDetail,
  operationStatus,
}: {
  resort: Resort;
  /** 地図抜きの詳細に付く営業集計。finalizedMapData があればそちらを優先する */
  operationStatus?: ResortOperationStatus;
  summaryOnly?: boolean;
  /** 渡すと、コース／リフトのブロックにそれぞれ「詳細」ボタンを出す */
  onShowCourseDetail?: () => void;
  onShowLiftDetail?: () => void;
}) {
  const newsLinks = resort.newsLinks ?? [];
  // 地図があればそこから、無ければサーバーで集計済みの operationStatus を使う
  const status = resort.finalizedMapData
    ? createResortOperationStatusFromMap(resort.finalizedMapData)
    : (operationStatus ?? resort.operationStatus);
  const courseStatus = status?.courses ?? null;
  // 「〇〇も同時に表示」中は、相手のスキー場のコンディションもまとめて出す。
  const simultaneous = useSimultaneousView(resort);
  const conditions = [
    ...(resort.currentConditions ?? []),
    ...simultaneous.conditions,
  ];
  // 「未取得」は出典が1つも登録されていないこと。出典があって中身が空のときは
  // 取得はできているので、件数を「不明」として出す。
  const hasCourseSource = hasSourceUrl(
    courseStatus?.sourceUrls ?? status?.courseSourceUrls,
  );
  const hasLiftSource = hasSourceUrl(status?.liftSourceUrls);
  const hasAnyCondition = conditions.some(item => item.weather);
  const courseSummary = courseStatus;
  const liftSummary = status?.lifts ?? null;
  const operationEntries = [
    ...(hasCourseSource
      ? [
          {
            label: "コース",
            time: courseStatus?.observedAt ?? status?.courseObservedAt,
          },
        ]
      : []),
    ...(hasLiftSource
      ? [{ label: "リフト", time: status?.liftObservedAt }]
      : []),
  ];
  const conditionEntries = (summaryOnly ? [] : conditions)
    .filter(item => item.weather && hasSourceUrl(item.weather.sourceUrls))
    .map(item => ({ label: "コンディション", time: item.weather?.time }));
  // 全部同じ時刻なら上にまとめて1行。コンディションだけ違うときは、
  // コンディションの時刻をその見出しの横に出す。
  const operationTimes = new Set(
    operationEntries.map(entry => formatOperationDate(entry.time)),
  );
  const conditionSeparate =
    operationEntries.length > 0 &&
    conditionEntries.some(
      entry =>
        operationTimes.size !== 1 ||
        !operationTimes.has(formatOperationDate(entry.time)),
    );
  const observationEntries = conditionSeparate
    ? operationEntries
    : [...operationEntries, ...conditionEntries];
  return (
    <section
      aria-label="営業・気象情報"
      className="@container/overview space-y-2"
    >
      {/* 比較カード（summaryOnly）で未取得なら、下の表に未取得が出るので見出し行ごと省く */}
      {(!summaryOnly || observationEntries.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {!summaryOnly && (
            <h2 className="text-base font-semibold text-slate-900">営業状況</h2>
          )}
          {observationEntries.length > 0 ? (
            <div className={`min-w-0 ${summaryOnly ? "ml-auto" : ""}`}>
              <ObservationTimes align="left" entries={observationEntries} />
            </div>
          ) : (
            <NotFetchedBadge title="営業状況はまだ取得できていません" />
          )}
        </div>
      )}
      {/* コースとリフトは常に横に並べ、縦の場所を取らないようにする */}
      <div className="grid grid-cols-2 gap-1.5 @min-[28rem]/overview:gap-2">
        <div className="min-w-0">
          <CourseStatusTable
            summary={courseSummary}
            unavailable={!hasCourseSource}
            onShowDetail={onShowCourseDetail}
            source={
              hasCourseSource ? (
                <SourceLine
                  compact
                  label="コース"
                  showLabel={false}
                  showFetched={false}
                  urls={courseStatus?.sourceUrls ?? status?.courseSourceUrls}
                  urlLabels={status?.courseSourceLabels}
                  updates={courseStatus?.updates ?? status?.courseUpdates}
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
                  compact
                  label="リフト"
                  showLabel={false}
                  showFetched={false}
                  urls={status?.liftSourceUrls}
                  updates={liftSummary?.updates}
                />
              ) : undefined
            }
          />
        </div>
      </div>
      {!summaryOnly && newsLinks.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">お知らせ</span>
          {newsLinks.map((link, index) => (
            <ExternalLinkComponent
              key={link.url}
              href={link.url}
              title={link.url}
              className="min-h-6 font-medium text-blue-700 underline underline-offset-2 md:min-h-8"
              icon={
                <ExternalLink
                  aria-hidden="true"
                  className="size-3 md:size-3.5"
                />
              }
            >
              お知らせ一覧{newsLinks.length > 1 ? ` ${index + 1}` : ""}
            </ExternalLinkComponent>
          ))}
        </p>
      )}
      {!summaryOnly && (
        <>
          {hasAnyCondition && (
            <section aria-label="コンディション" className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h3 className="text-sm font-semibold text-slate-900">
                  コンディション
                </h3>
                {conditionSeparate && (
                  <ObservationTimes align="left" entries={conditionEntries} />
                )}
                {conditions.map(
                  item =>
                    item.weather && (
                      <div key={item.id} className="min-w-0">
                        <SourceLine
                          compact
                          label="コンディション"
                          showFetched={false}
                          showLabel={false}
                          showPublished={false}
                          urls={item.weather.sourceUrls}
                        />
                      </div>
                    ),
                )}
              </div>
              {conditions.map(
                item =>
                  item.weather && (
                    <ConditionTable key={item.id} data={item.weather.data} />
                  ),
              )}
            </section>
          )}
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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h3 className="text-sm font-semibold text-slate-900">
                  コメント
                </h3>
                {conditions.map(
                  item =>
                    item.comment && (
                      <div key={item.id} className="min-w-0">
                        <SourceLine
                          compact
                          label="コメント"
                          showFetched={false}
                          showLabel={false}
                          showPublished={false}
                          urls={item.comment.sourceUrls}
                        />
                      </div>
                    ),
                )}
              </div>
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
