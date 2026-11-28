import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow className="text-left">
          <TableHead>地点</TableHead>
          <TableHead>天気</TableHead>
          <TableHead>気温</TableHead>
          <TableHead>積雪</TableHead>
          <TableHead>降雪</TableHead>
          <TableHead>雪質</TableHead>
          <TableHead>風速</TableHead>
          <TableHead>更新</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {points.map(point => (
          <TableRow key={point.point}>
            <TableCell className="font-medium text-gray-800">
              {point.point}
            </TableCell>
            <TableCell>{point.weather ?? "-"}</TableCell>
            <TableCell>{point.temperature ?? "-"}</TableCell>
            <TableCell>{point.snowDepth ?? "-"}</TableCell>
            <TableCell>{point.snowfall ?? "-"}</TableCell>
            <TableCell>{point.condition ?? "-"}</TableCell>
            <TableCell>{point.windSpeed ?? "-"}</TableCell>
            <TableCell className="text-gray-500">
              {point.update ?? "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
      <Table className="min-w-[480px]">
        <TableHeader>
          <TableRow className="text-left">
            <TableHead>名称</TableHead>
            <TableHead>状態</TableHead>
            <TableHead>更新</TableHead>
            <TableHead>備考</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {withKeys(items).map(({ item, key }) => {
            const status = STATUS_TONE[normalizeStatus(item.status)];
            return (
              <TableRow key={key}>
                <TableCell className="text-gray-800">{item.name}</TableCell>
                <TableCell>
                  <StatusPill tone={status.tone}>
                    {item.status ?? "-"} {status.label}
                  </StatusPill>
                </TableCell>
                <TableCell className="text-gray-500">
                  {item.update ?? "-"}
                </TableCell>
                <TableCell className="text-gray-600">
                  {item.note ?? "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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
