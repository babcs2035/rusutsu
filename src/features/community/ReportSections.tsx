import Image from "next/image";
import { ENTRY_KINDS, type PublicReportEntry } from "./contract";

export function reportEntryTitle(entry: PublicReportEntry) {
  if (entry.kind === "COURSE" || entry.kind === "LIFT") return entry.targetName;
  const label = ENTRY_KINDS[entry.kind];
  return `${label}${entry.itemType ? `・${entry.itemType}` : ""}${entry.targetName !== label ? ` · ${entry.targetName}` : ""}`;
}

// 1件の投稿は1項目。ここでは項目の内容をそのまま並べる。
export function ReportSections({ entries }: { entries: PublicReportEntry[] }) {
  return (
    <div className="space-y-2" role="group" aria-label="レポートの内容">
      {entries.map(entry => (
        <section
          key={entry.id}
          id={`entry-${entry.clientKey}`}
          className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2"
        >
          <h4 className="text-sm font-semibold text-slate-800">
            <span className="mr-1.5 text-xs font-medium text-slate-500">
              {ENTRY_KINDS[entry.kind]}
            </span>
            {reportEntryTitle(entry)}
          </h4>
          <div className="mt-2 space-y-1 text-sm text-slate-700">
            {entry.status && <p>状況：{entry.status}</p>}
            {entry.snowQualities.length > 0 && (
              <p>雪質：{entry.snowQualities.join("・")}</p>
            )}
            {entry.crowding && <p>混雑：{entry.crowding}</p>}
            {entry.waitMinutes != null && (
              <p>待ち時間：約{entry.waitMinutes}分</p>
            )}
            {(entry.liftSpeedLevel || entry.liftSpeed != null) && (
              <p>
                速度：
                {[
                  entry.liftSpeedLevel,
                  entry.liftSpeed != null
                    ? `${entry.liftSpeed.toFixed(1)}m/s（${(entry.liftSpeed * 3.6).toFixed(1)}km/h）`
                    : null,
                ]
                  .filter(Boolean)
                  .join("・")}
              </p>
            )}
            {entry.depth && <p>深さ：{entry.depth}</p>}
            {entry.size && <p>サイズ：{entry.size}</p>}
            {entry.body && (
              <p className="whitespace-pre-wrap break-words">{entry.body}</p>
            )}
            {entry.photos.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {entry.photos.map(photo => (
                  <Image
                    key={photo.id}
                    className="aspect-square w-full rounded object-cover"
                    src={`/rusutsu/api/community/photos/${encodeURIComponent(photo.id)}`}
                    alt={`${reportEntryTitle(entry)}の写真`}
                    width={photo.width}
                    height={photo.height}
                    unoptimized
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
