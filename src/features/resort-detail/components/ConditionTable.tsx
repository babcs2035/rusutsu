import { conditionText, record } from "../utils/currentConditions";

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
  const showLocation = !(points.length === 1 && points[0].name === "中腹");
  if (!columns.length)
    return (
      <p className="text-sm text-slate-500">
        コンディションの情報はありません。
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table aria-label="コンディション" className="w-full text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-slate-600">
            {showLocation && (
              <th
                scope="col"
                className="sticky left-0 z-10 whitespace-nowrap bg-slate-100 px-2 py-2 font-medium shadow-[1px_0_0_0_#e2e8f0]"
              >
                観測地点
              </th>
            )}
            {columns.map(field => (
              <th
                key={field.key}
                scope="col"
                className="whitespace-nowrap px-2 py-2 font-medium"
              >
                {field.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map(point => (
            <tr
              key={point.name}
              className="border-t border-slate-200 odd:bg-white even:bg-slate-50"
            >
              {showLocation && (
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-20 bg-inherit px-2 py-2 text-left font-medium shadow-[1px_0_0_0_#e2e8f0]"
                >
                  {point.name}
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
                    className="min-w-16 px-2 py-2 tabular-nums text-slate-700"
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
