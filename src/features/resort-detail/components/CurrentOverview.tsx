import { ExternalLink } from "lucide-react";
import type { CourseStatusSummary } from "@/lib/courseStatusSummary";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
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
import { formatOperationDate } from "../utils/operationDates";
import { NotFetchedBadge, SourceLine } from "./CompactInfo";
import { ConditionTable } from "./ConditionTable";
import { CourseStatusTable } from "./CourseStatusTable";
import { LinkedMemberTabs, useLinkedMember } from "./LinkedArea";
import { LinkedAreaMapToggle, useLinkedAreaShown } from "./LinkedAreaMapToggle";
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
  onSelectResort,
}: {
  resort: Resort;
  summaryOnly?: boolean;
  onSelectResort?: (id: string) => void;
  /** 渡すと、コース／リフトのブロックにそれぞれ「詳細」ボタンを出す */
  onShowCourseDetail?: () => void;
  onShowLiftDetail?: () => void;
}) {
  const courses = resort.finalizedMapData?.courses;
  const newsLinks = resort.newsLinks ?? [];
  const lifts = resort.finalizedMapData?.lifts;
  const courseStatus = resort.finalizedMapData?.courseStatusSummary;
  // 連携エリアのコンディション・コメントはスキー場ごとのタブで切り替える。
  // コースとリフトの営業状況はエリア全体で共通。
  // 「〇〇も同時に表示」中は、つながったスキー場のコンディションもまとめて出す。
  const {
    members: linkedMembers,
    activeId,
    setActiveId,
  } = useLinkedMember(resort);
  const showLinkedArea = useLinkedAreaShown(resort);
  const members = showLinkedArea ? [] : linkedMembers;
  const conditions = (resort.currentConditions ?? []).filter(
    item =>
      (showLinkedArea && linkedMembers.some(member => member.id === item.id)) ||
      members.length < 2 ||
      item.id === activeId,
  );
  // 「未取得」は出典が1つも登録されていないこと。出典があって中身が空のときは
  // 取得はできているので、件数を「不明」として出す。
  const hasCourseSource = hasSourceUrl(
    courseStatus?.sourceUrls ?? courses?.sourceUrls,
  );
  const hasLiftSource = hasSourceUrl(lifts?.sourceUrls);
  // 連携エリアでは、どれか1つにコンディションがあれば切り替えタブを出す。
  const hasAnyCondition = (resort.currentConditions ?? []).some(
    item => item.weather,
  );
  const courseSummary = hasCourseSource
    ? courseStatus
    : createMapCourseSummary(
        courses ? createFinalizedCourseGroups(courses.features).length : null,
      );
  const liftSummary = createLiftStatusSummary(lifts);
  const operationEntries = [
    ...(hasCourseSource
      ? [
          {
            label: "コース",
            time: courseStatus?.observedAt ?? courses?.observedAt,
          },
        ]
      : []),
    ...(hasLiftSource ? [{ label: "リフト", time: lifts?.observedAt }] : []),
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {!summaryOnly && (
          <h2 className="text-base font-semibold text-slate-900 @min-[28rem]/overview:text-lg">
            営業状況
          </h2>
        )}
        {observationEntries.length > 0 ? (
          <div className={`min-w-0 ${summaryOnly ? "ml-auto" : ""}`}>
            <ObservationTimes align="left" entries={observationEntries} />
          </div>
        ) : (
          <NotFetchedBadge title="営業状況はまだ取得できていません" />
        )}
      </div>
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
                  urls={courseStatus?.sourceUrls ?? courses?.sourceUrls}
                  urlLabels={courseStatus?.sourceLabels}
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
                  compact
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
        <LinkedAreaMapToggle resort={resort} onSelectResort={onSelectResort} />
      )}
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
                <h3 className="text-sm font-semibold text-slate-900 @min-[28rem]/overview:text-base">
                  コンディション
                </h3>
                <LinkedMemberTabs
                  members={members}
                  activeId={activeId}
                  onChange={setActiveId}
                  label="コンディションを見るスキー場"
                />
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
              <h3 className="text-sm font-semibold text-slate-900 @min-[28rem]/overview:text-base">
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
