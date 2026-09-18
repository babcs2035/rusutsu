export type ProportionSegment = {
  key: string;
  label: string;
  color: string;
  percent: number;
};

/** 構成比を1本の帯と凡例で示す。レベル別・斜度別で同じ形にそろえる。 */
export function ProportionBar({
  title,
  note,
  segments,
  emptyText,
}: {
  title: string;
  note: string;
  segments: ProportionSegment[];
  emptyText: string;
}) {
  // 0.0% と表示されるだけの区分は凡例を伸ばすだけなので落とす
  const shown = segments.filter(segment => segment.percent >= 0.05);
  // 区切り線を引く位置（先頭からの累積％）。境目が細い区分でも輪郭が分かる。
  const boundaries = shown
    .slice(0, -1)
    .map((_, index) =>
      shown
        .slice(0, index + 1)
        .reduce((sum, segment) => sum + segment.percent, 0),
    );
  return (
    <section className="space-y-1.5">
      <h2 className="text-sm font-bold text-slate-900">
        {title} <span className="font-normal text-slate-700">{note}</span>
      </h2>
      {shown.length ? (
        <>
          {/* 上下の余白は区切り線のはみ出し分。帯そのものは h-4 のまま。 */}
          <div className="relative py-1">
            <div
              className="flex h-4 overflow-hidden rounded"
              role="img"
              aria-label={shown
                .map(
                  segment => `${segment.label} ${segment.percent.toFixed(1)}%`,
                )
                .join("、")}
            >
              {shown.map(segment => (
                <div
                  key={segment.key}
                  style={{
                    width: `${segment.percent}%`,
                    background: segment.color,
                  }}
                />
              ))}
            </div>
            {boundaries.map(position => (
              <span
                key={position}
                aria-hidden="true"
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_0.5px_rgba(15,23,42,0.45)]"
                style={{ left: `${position}%` }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-slate-700">
            {shown.map(segment => (
              <span key={segment.key} className="whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block size-2.5 rounded-[2px] align-middle ring-1 ring-slate-400/60"
                  style={{ background: segment.color }}
                />
                {segment.label}{" "}
                <span className="tabular-nums">
                  {segment.percent.toFixed(1)}%
                </span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-700">{emptyText}</p>
      )}
    </section>
  );
}
