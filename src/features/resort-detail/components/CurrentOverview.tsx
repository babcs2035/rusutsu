import type { Resort } from "../types";
import { conditionText, record } from "../utils/currentConditions";
import {
  createFinalizedCourseGroups,
  getCourseGroupStatus,
} from "../utils/detailMetrics";
import { CompactMetric, operationText, SourceLine } from "./CompactInfo";

const unit = (value: unknown, suffix: string) => {
  const text = conditionText(value);
  return text == null
    ? "—"
    : /^[+-]?\d+(?:\.\d+)?$/u.test(text)
      ? `${text}${suffix}`
      : text;
};
export function CurrentOverview({ resort }: { resort: Resort }) {
  const courses = resort.finalizedMapData?.courses;
  const lifts = resort.finalizedMapData?.lifts;
  const conditions = resort.currentConditions ?? [];
  return (
    <section aria-label="営業・気象情報" className="space-y-2">
      <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <CompactMetric label="コース · 全面滑走 / 全数">
          {operationText(
            courses?.features.length
              ? createFinalizedCourseGroups(courses.features).map(
                  group => getCourseGroupStatus(group).symbol,
                )
              : resort.courses.map(() => null),
          )}
        </CompactMetric>
        <CompactMetric label="リフト · 運行 / 全数">
          {operationText(
            lifts?.features.length
              ? lifts.features.map(lift => lift.properties.status)
              : resort.lifts.map(() => null),
            "待機",
          )}
        </CompactMetric>
      </dl>
      <div>
        <SourceLine
          label="コース"
          time={courses?.observedAt}
          urls={courses?.sourceUrls}
          updates={courses?.features.map(c => c.properties.update ?? "")}
        />
        <SourceLine
          label="リフト"
          time={lifts?.observedAt}
          urls={lifts?.sourceUrls}
          updates={lifts?.features.map(l => l.properties.update ?? "")}
        />
      </div>
      {conditions.some(
        item => Object.keys(record(item.weather?.data)).length,
      ) ? (
        conditions.map(
          item =>
            Object.keys(record(item.weather?.data)).length > 0 && (
              <div key={item.id}>
                <table className="w-full rounded-lg bg-slate-50 text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      {["観測地点", "積雪", "天候", "気温"].map(label => (
                        <th key={label} className="px-2 py-1 font-normal">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(record(item.weather?.data)).map(
                      ([name, raw]) => {
                        const point = record(raw);
                        return (
                          <tr
                            key={name}
                            className="border-t border-slate-200/60"
                          >
                            <th
                              scope="row"
                              className="max-w-28 px-2 py-1.5 text-left font-medium break-words"
                            >
                              {name}
                            </th>
                            <td className="px-2 py-1.5 font-semibold tabular-nums">
                              {unit(point.snowDepth, "cm")}
                            </td>
                            <td className="px-2 py-1.5">
                              {conditionText(point.weather) ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 font-semibold tabular-nums">
                              {unit(point.temperature, "℃")}
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
                <SourceLine
                  label={item.weather?.archived ? "気象（保存データ）" : "気象"}
                  time={item.weather?.time}
                  urls={item.weather?.sourceUrls}
                  updates={Object.values(record(item.weather?.data)).map(
                    point => conditionText(record(point).update) ?? "",
                  )}
                />
              </div>
            ),
        )
      ) : (
        <div>
          <dl className="grid grid-cols-3 rounded-lg bg-slate-50 px-3 py-2">
            {["積雪", "天候", "気温"].map(label => (
              <CompactMetric key={label} label={label}>
                —
              </CompactMetric>
            ))}
          </dl>
          <SourceLine
            label={
              conditions[0]?.weather?.archived ? "気象（保存データ）" : "気象"
            }
            time={conditions[0]?.weather?.time}
            urls={conditions[0]?.weather?.sourceUrls}
          />
        </div>
      )}
      {conditions.map(item => {
        const comment = conditionText(record(item.comment?.data).value);
        if (!comment && !item.comment?.sourceUrls.length) return null;
        return (
          <div key={item.id} className="border-l-2 border-slate-300 pl-2">
            <details>
              <summary className="cursor-pointer text-xs font-medium text-slate-800">
                <span className="inline-block max-w-[90%] truncate align-bottom">
                  {comment ?? "スキー場からのお知らせ"}
                </span>
                <span className="ml-1 text-blue-700">全文</span>
              </summary>
              <p className="mt-1 whitespace-pre-line break-words text-sm">
                {comment ?? "コメント未取得"}
              </p>
            </details>
            <SourceLine
              label={
                item.comment?.archived ? "お知らせ（保存データ）" : "お知らせ"
              }
              time={item.comment?.time}
              urls={item.comment?.sourceUrls}
            />
          </div>
        );
      })}
    </section>
  );
}
