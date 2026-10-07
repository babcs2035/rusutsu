import { conditionText, record } from "../utils/currentConditions";
import { formatPublishedDate } from "../utils/operationDates";

const observationText = (value: unknown) => {
  const text = conditionText(value);
  return text && /^[—–]+$/u.test(text) ? null : text;
};

const fields = [
  { key: "snowDepth", label: "積雪", unit: "cm" },
  { key: "snowfall", label: "新雪", unit: "cm" },
  { key: "weather", label: "天候", unit: "" },
  { key: "temperature", label: "気温", unit: "℃" },
  { key: "windSpeed", label: "風速", unit: "m/s" },
  { key: "condition", label: "雪質・状態", unit: "" },
];

export function ConditionTable({ data }: { data: unknown }) {
  const points = Object.entries(record(data)).map(([name, value]) => ({
    name,
    values: record(value),
  }));
  const columns = fields.filter(field =>
    points.some(point => observationText(point.values[field.key]) !== null),
  );
  const hasUpdates = points.some(point => observationText(point.values.update));
  const showLocation =
    hasUpdates || !(points.length === 1 && points[0].name === "中腹");
  if (!columns.length)
    return (
      <p className="text-sm text-slate-700 md:text-base">
        コンディションの情報はありません。
      </p>
    );
  return (
    // isolate で独立したスタッキングコンテキストにして、観測地点列の sticky が
    // ページ全体をスクロールするタブバーなど、外側の sticky 要素と
    // z-index・描画順で干渉しないようにする（高速スクロール時に一瞬重なる不具合の対策）。
    <div className="isolate overflow-x-auto rounded-lg border border-slate-200">
      <table
        aria-label="コンディション"
        className="w-full text-sm md:text-base"
      >
        <thead>
          <tr className="bg-slate-100 text-left text-xs text-slate-700 md:text-sm">
            {showLocation && (
              <th
                scope="col"
                className="sticky left-0 z-10 whitespace-nowrap bg-slate-100 px-2 py-1 font-medium md:py-1.5 shadow-[1px_0_0_0_#e2e8f0] will-change-transform"
              >
                地点
              </th>
            )}
            {columns.map(field => (
              <th
                key={field.key}
                scope="col"
                className="whitespace-nowrap px-2 py-1 font-medium md:py-1.5"
              >
                {field.label}
              </th>
            ))}
          </tr>
        </thead>
        {points.map((point, index) => (
          <tbody
            key={point.name}
            className={`border-t border-slate-200 ${index % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
          >
            <tr className="bg-inherit">
              {showLocation && (
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-20 bg-inherit px-2 py-1.5 text-left font-medium md:py-2 shadow-[1px_0_0_0_#e2e8f0] will-change-transform"
                >
                  <span className="block">{point.name}</span>
                </th>
              )}
              {columns.map(field => {
                const text = observationText(point.values[field.key]);
                const value =
                  text === null
                    ? "—"
                    : /^[+-]?\d+(?:\.\d+)?$/u.test(text)
                      ? `${text}${field.unit}`
                      : text;
                return (
                  <td
                    key={field.key}
                    className="min-w-12 px-2 py-1.5 tabular-nums text-slate-800 md:min-w-16 md:py-2"
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
            {hasUpdates && (
              <tr>
                <td
                  colSpan={columns.length + (showLocation ? 1 : 0)}
                  className="px-2 pb-1.5 md:pb-2"
                >
                  {/* 日時は全列にまたがる行に置き、地点名の列幅で折り返さない。 */}
                  <span className="sticky left-2 inline-block whitespace-nowrap rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[11px] leading-4 tabular-nums text-blue-800 md:px-2 md:text-xs md:leading-5">
                    <span className="sr-only">{point.name}の更新日時: </span>
                    {formatPublishedDate(
                      observationText(point.values.update) ?? "",
                    ) ?? "更新日時不明"}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        ))}
      </table>
    </div>
  );
}
