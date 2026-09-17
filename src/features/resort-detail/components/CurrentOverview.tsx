import { Clock3 } from "lucide-react";
import type { Resort } from "../types";
import { removeGeneratedCommentLinks } from "../utils/commentContent";
import { conditionText, record, sourceUrls } from "../utils/currentConditions";
import { createLiftStatusSummary } from "../utils/liftStatusSummary";
import { SourceLine } from "./CompactInfo";
import { ConditionTable } from "./ConditionTable";
import { CourseStatusTable } from "./CourseStatusTable";
import { ObservationTimes } from "./ObservationTimes";
import { ResortComment } from "./ResortComment";

export function CurrentOverview({
  resort,
  summaryOnly = false,
}: {
  resort: Resort;
  summaryOnly?: boolean;
}) {
  const courses = resort.finalizedMapData?.courses;
  const lifts = resort.finalizedMapData?.lifts;
  const courseStatus = resort.finalizedMapData?.courseStatusSummary;
  const liftStatus = createLiftStatusSummary(lifts);
  const conditions = resort.currentConditions ?? [];
  return (
    <section aria-label="営業・気象情報" className="space-y-2">
      <div className="flex items-start gap-1.5 text-slate-500">
        <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <ObservationTimes
          align="left"
          entries={[
            {
              label: "コース",
              time: courseStatus?.observedAt ?? courses?.observedAt,
            },
            { label: "リフト", time: lifts?.observedAt },
            ...(summaryOnly ? [] : conditions)
              .filter(item => item.weather)
              .map(item => ({ label: "天候", time: item.weather?.time })),
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1 border-r border-slate-200 pr-3">
          <CourseStatusTable summary={courseStatus} />
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
        </div>
        <div className="min-w-0 space-y-1">
          <CourseStatusTable summary={liftStatus} kind="lift" />
          <SourceLine
            label="リフト"
            showLabel={false}
            showFetched={false}
            urls={lifts?.sourceUrls}
            updates={liftStatus?.updates}
          />
        </div>
      </div>
      {!summaryOnly && (
        <>
          <section
            aria-label="コンディション"
            className="space-y-1.5 border-t border-slate-200 pt-2"
          >
            <h3 className="text-base font-semibold text-slate-800 sm:text-lg">
              コンディション
            </h3>
            {conditions.some(item => item.weather) ? (
              conditions.map(
                item =>
                  item.weather && (
                    <div key={item.id} className="space-y-1">
                      <ConditionTable data={item.weather.data} />
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
              <p className="text-sm text-slate-500">
                コンディションの情報はありません。
              </p>
            )}
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
              <h3 className="text-base font-semibold text-slate-800 sm:text-lg">
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
