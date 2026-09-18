import { formatOperationDate } from "../utils/operationDates";

export function ObservationTimes({
  entries,
  align = "right",
}: {
  align?: "left" | "right";
  entries: Array<{ label: string; time?: string | null }>;
}) {
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const date = formatOperationDate(entry.time) ?? "日時不明";
    groups.set(date, [...(groups.get(date) ?? []), entry.label]);
  }
  return (
    <div
      className={`min-w-0 space-y-0.5 text-sm leading-5 text-slate-700 ${align === "right" ? "ml-auto text-right" : "text-left"}`}
      role="group"
      aria-label="情報取得日時"
    >
      {[...groups].map(([date, labels]) => (
        <p key={date}>
          {date === "日時不明" ? "取得日時不明" : `${date} 取得`}
          {groups.size > 1 ? `（${labels.join("・")}）` : ""}
        </p>
      ))}
    </div>
  );
}
