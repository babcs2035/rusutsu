import {
  normalizeStatus,
  type OperationItem,
  parseCommentValue,
  parseOperationItems,
  parseWeatherPoints,
  summarizeOperationItems,
} from "../utils/categoryData";
import type { CategoryKind, Tone } from "../utils/labels";
import { StatusPill } from "./StatusPill";

const STATUS_TONE: Record<
  ReturnType<typeof normalizeStatus>,
  { tone: Tone; label: string }
> = {
  open: { tone: "ok", label: "営業" },
  hold: { tone: "warn", label: "一部/準備中" },
  closed: { tone: "bad", label: "停止" },
  unknown: { tone: "muted", label: "不明" },
};

const EMPTY = (
  <p className="text-sm text-gray-500">表示できる値がありません。</p>
);

function WeatherTable({ data }: { data: unknown }) {
  const points = parseWeatherPoints(data);
  if (points.length === 0) return EMPTY;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-600">
          <tr>
            <th className="px-2 py-1 font-medium">地点</th>
            <th className="px-2 py-1 font-medium">天気</th>
            <th className="px-2 py-1 font-medium">気温</th>
            <th className="px-2 py-1 font-medium">積雪</th>
            <th className="px-2 py-1 font-medium">降雪</th>
            <th className="px-2 py-1 font-medium">雪質</th>
            <th className="px-2 py-1 font-medium">風速</th>
            <th className="px-2 py-1 font-medium">更新</th>
          </tr>
        </thead>
        <tbody>
          {points.map(point => (
            <tr key={point.point} className="border-t border-gray-100">
              <td className="px-2 py-1 font-medium text-gray-800">
                {point.point}
              </td>
              <td className="px-2 py-1">{point.weather ?? "-"}</td>
              <td className="px-2 py-1">{point.temperature ?? "-"}</td>
              <td className="px-2 py-1">{point.snowDepth ?? "-"}</td>
              <td className="px-2 py-1">{point.snowfall ?? "-"}</td>
              <td className="px-2 py-1">{point.condition ?? "-"}</td>
              <td className="px-2 py-1">{point.windSpeed ?? "-"}</td>
              <td className="px-2 py-1 text-xs text-gray-500">
                {point.update ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 同名のコース・リフトが並ぶことがあるので、出現順で番号を振って区別する。 */
const withKeys = (items: readonly OperationItem[]) => {
  const seen = new Map<string, number>();
  return items.map(item => {
    const order = (seen.get(item.name) ?? 0) + 1;
    seen.set(item.name, order);
    return { item, key: `${item.name}#${order}` };
  });
};

function OperationTable({ items }: { items: readonly OperationItem[] }) {
  if (items.length === 0) return EMPTY;
  const counts = summarizeOperationItems(items);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <StatusPill tone="ok">営業 {counts.open}</StatusPill>
        <StatusPill tone="warn">一部/準備中 {counts.hold}</StatusPill>
        <StatusPill tone="bad">停止 {counts.closed}</StatusPill>
        {counts.unknown > 0 ? (
          <StatusPill tone="muted">不明 {counts.unknown}</StatusPill>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-600">
            <tr>
              <th className="px-2 py-1 font-medium">名称</th>
              <th className="px-2 py-1 font-medium">状態</th>
              <th className="px-2 py-1 font-medium">更新</th>
              <th className="px-2 py-1 font-medium">備考</th>
            </tr>
          </thead>
          <tbody>
            {withKeys(items).map(({ item, key }) => {
              const status = STATUS_TONE[normalizeStatus(item.status)];
              return (
                <tr key={key} className="border-t border-gray-100">
                  <td className="px-2 py-1 text-gray-800">{item.name}</td>
                  <td className="px-2 py-1">
                    <StatusPill tone={status.tone}>
                      {item.status ?? "-"} {status.label}
                    </StatusPill>
                  </td>
                  <td className="px-2 py-1 text-xs text-gray-500">
                    {item.update ?? "-"}
                  </td>
                  <td className="px-2 py-1 text-xs text-gray-600">
                    {item.note ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** カテゴリごとに、取得できた中身をそのまま読める形で出す。 */
export function CategoryDataView({
  kind,
  data,
}: {
  kind: CategoryKind;
  data: unknown;
}) {
  if (data === null || data === undefined) return EMPTY;
  if (kind === "COMMENT") {
    const value = parseCommentValue(data);
    return value === null ? (
      EMPTY
    ) : (
      <p className="whitespace-pre-wrap text-sm text-gray-800">{value}</p>
    );
  }
  if (kind === "WEATHER") return <WeatherTable data={data} />;
  return <OperationTable items={parseOperationItems(data)} />;
}
