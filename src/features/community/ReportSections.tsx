import { ENTRY_KINDS, type PublicReportEntry } from "./contract";

export function reportEntryTitle(entry: PublicReportEntry) {
  if (entry.kind === "COURSE" || entry.kind === "LIFT") return entry.targetName;
  const label = ENTRY_KINDS[entry.kind];
  return `${label}${entry.itemType ? `・${entry.itemType}` : ""}${entry.targetName !== label ? ` · ${entry.targetName}` : ""}`;
}

export function ReportSections({
  entries,
  compact = false,
}: {
  entries: PublicReportEntry[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-2" role="group" aria-label="レポートの項目">
      {(compact ? entries.slice(0, 3) : entries).map(entry => (
        <details
          key={entry.id}
          id={`entry-${entry.clientKey}`}
          open={!compact}
          className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2"
        >
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            <span className="mr-1.5 text-xs font-medium text-slate-500">
              {ENTRY_KINDS[entry.kind]}
            </span>
            {reportEntryTitle(entry)}
            {entry.rating != null && (
              <span className="ml-2 whitespace-nowrap text-xs font-normal">
                ★ {entry.rating}
              </span>
            )}
          </summary>
          <div className="mt-2 space-y-1 text-sm text-slate-700">
            {entry.body && (
              <p className="whitespace-pre-wrap break-words">{entry.body}</p>
            )}
            {entry.snowQualities.length > 0 && (
              <p>{entry.snowQualities.join("・")}</p>
            )}
            {entry.conditions.length > 0 && (
              <p>{entry.conditions.join("・")}</p>
            )}
            {entry.crowding && <p>混雑：{entry.crowding}</p>}
            {entry.waitMinutes != null && (
              <p>待ち時間：約{entry.waitMinutes}分</p>
            )}
            {entry.present != null && (
              <p>
                {entry.kind === "MOGUL"
                  ? entry.present
                    ? "コブあり"
                    : "コブなし"
                  : entry.present
                    ? "設置中"
                    : "撤去済み"}
                {entry.size ? ` · ${entry.size}` : ""}
              </p>
            )}
          </div>
        </details>
      ))}
      {compact && entries.length > 3 && (
        <p className="text-xs text-slate-500">ほか{entries.length - 3}項目</p>
      )}
    </div>
  );
}
