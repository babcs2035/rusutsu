import { Clock3 } from "lucide-react";
import { formatOperationDate } from "../utils/operationDates";

/**
 * 取得日時の行。コース・リフト・コンディションで取得日時がずれることがあるので
 * （夏にコース状況の掲載が止まる等）、日時ごとにまとめて対象を前置きする。
 * 全部同じ日時なら対象は書かず「〜取得」だけにする。
 */
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
      className={`min-w-0 space-y-0.5 text-sm leading-5 text-slate-600 ${align === "right" ? "ml-auto text-right" : "text-left"}`}
      role="group"
      aria-label="情報取得日時"
    >
      {[...groups].map(([date, labels]) => (
        <p
          key={date}
          className={`flex min-w-0 items-start gap-1.5 ${align === "right" ? "justify-end" : ""}`}
        >
          <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {/* 狭い画面では対象と日時の間で折り返し、日時の途中では切らない */}
          <span className="min-w-0">
            {groups.size > 1 ? `${labels.join(", ")}: ` : ""}
            <span className="whitespace-nowrap">
              {date === "日時不明" ? "取得日時不明" : `${date} 取得`}
            </span>
          </span>
        </p>
      ))}
    </div>
  );
}
