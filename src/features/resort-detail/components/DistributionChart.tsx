export type DistributionColumn = {
  key: string;
  label: string;
  color: string;
  /** 滑走距離（m） */
  distance: number;
  /** 「営業中のみ」で絞り込んだときの距離 */
  openDistance?: number;
};

/** 割合と並べて見比べる値なので、距離は 0.1km 単位で十分 */
export const formatKm = (meters: number) => (meters / 1000).toFixed(1);

/** 割合は整数で十分。0 ではないのに丸めると 0 になるものは「<1」にする */
const formatPercent = (value: number, total: number) => {
  if (!total || value <= 0) return "0";
  const percent = (value / total) * 100;
  return percent < 0.5 ? "<1" : String(Math.round(percent));
};

/**
 * 数値の列幅。「営業中のみ」を切り替えても列幅を変えず、棒の長さを保つ。
 * 絞り込み中は割合を出さず、その幅を距離（営業中/全体）に回す。
 */
const DISTANCE_WIDTH = "4.25rem";
const PERCENT_WIDTH = "3rem";

/** 行は横線、数値の列は縦線で区切り、数字の並びを表として読めるようにする */
const ROW_CLASS = "border-b border-slate-200 py-0.5";
const NUMBER_CELL_CLASS = `${ROW_CLASS} border-l px-1.5 text-right whitespace-nowrap`;
const HEADER_CLASS = `${NUMBER_CELL_CLASS} text-[11px] leading-5 text-slate-500`;
const VALUE_CLASS = `${NUMBER_CELL_CLASS} font-semibold text-slate-900 tabular-nums`;
/** 「営業中/全体」の分母。分子と同じ大きさのまま、細く薄くして分子を読ませる */
const DENOMINATOR_CLASS = "font-normal text-slate-500";

/** 単位は数字より一回り小さく細くして、数字を先に読ませる */
function Unit({ children }: { children: string }) {
  return <span className="text-[0.8em] font-normal">{children}</span>;
}

export function Fraction({
  open,
  total,
  unit,
}: {
  open: string;
  total: string;
  unit?: string;
}) {
  return (
    <>
      {open}
      {unit && <Unit>{unit}</Unit>}
      <span className="mx-0.5 font-normal text-slate-400">/</span>
      <span className={DENOMINATOR_CLASS}>
        {total}
        {unit && <Unit>{unit}</Unit>}
      </span>
    </>
  );
}

type ValueRow = {
  distance: number;
  openDistance: number;
};

/**
 * 区分ごとの滑走距離を横棒で並べ、右側に距離・割合の表を添える。
 * 見出しは表の左上のマスに置き、最後の行に合計を出す。
 * 絞り込み中は全体を薄い棒で残し、営業中の分を同じ目盛りで重ねる。
 * 数値も「営業中/全体」の距離にし、割合は出さない。
 */
export function DistributionChart({
  title,
  note,
  columns,
  filtered,
  emptyText,
  max: scaleMax,
}: {
  title: string;
  /** 表の下に添える補足（集計から除いたものなど） */
  note?: string;
  columns: DistributionColumn[];
  filtered: boolean;
  emptyText: string;
  /** 棒の長さの分母となる距離（m）。複数のチャートで目盛りをそろえるときに渡す */
  max?: number;
}) {
  const sum = (values: Array<number | undefined>) =>
    values.reduce<number>((total, value) => total + (value ?? 0), 0);
  const total = sum(columns.map(column => column.distance));
  const totalRow: ValueRow = {
    distance: total,
    openDistance: sum(columns.map(column => column.openDistance)),
  };
  const ownMax = Math.max(0, ...columns.map(column => column.distance));
  const max = Math.max(ownMax, scaleMax ?? 0);
  const valueColumns = `${DISTANCE_WIDTH} ${PERCENT_WIDTH}`;
  const renderValues = (row: ValueRow) =>
    filtered ? (
      <span className={`col-span-2 ${VALUE_CLASS}`}>
        <Fraction
          open={formatKm(row.openDistance)}
          total={formatKm(row.distance)}
          unit="km"
        />
      </span>
    ) : (
      <>
        <span className={VALUE_CLASS}>
          {formatKm(row.distance)}
          <Unit>km</Unit>
        </span>
        <span className={VALUE_CLASS}>
          {formatPercent(row.distance, total)}
          <Unit>%</Unit>
        </span>
      </>
    );
  if (ownMax <= 0)
    return (
      <section className="space-y-1">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-700">{emptyText}</p>
      </section>
    );
  return (
    <section className="space-y-1">
      {/* 区分名・棒・数値の表を列でそろえ、上下で見比べやすくする */}
      <div
        className="grid border-t border-slate-200 text-sm"
        style={{
          gridTemplateColumns: `auto minmax(0, 1fr) ${valueColumns}`,
        }}
      >
        <h2
          className={`col-span-2 ${ROW_CLASS} self-stretch text-sm font-bold text-slate-900`}
        >
          {title}
        </h2>
        {filtered ? (
          <span className={`col-span-2 ${HEADER_CLASS}`}>営業中/全体</span>
        ) : (
          <>
            <span className={HEADER_CLASS}>距離</span>
            <span className={HEADER_CLASS}>割合</span>
          </>
        )}
        {columns.map(column => {
          const value = column.openDistance ?? 0;
          return (
            <div key={column.key} className="contents">
              <span
                className={`${ROW_CLASS} pr-2 whitespace-nowrap text-slate-700`}
              >
                {column.label}
              </span>
              <div
                aria-hidden="true"
                className={`${ROW_CLASS} flex h-full items-center pr-2`}
              >
                <div
                  className="relative h-3.5 overflow-hidden rounded-r"
                  style={{
                    width: `${(column.distance / max) * 100}%`,
                    background: filtered
                      ? `color-mix(in srgb, ${column.color} 22%, white)`
                      : column.color,
                  }}
                >
                  {filtered && (
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${column.distance ? (value / column.distance) * 100 : 0}%`,
                        background: column.color,
                      }}
                    />
                  )}
                </div>
              </div>
              {renderValues({
                distance: column.distance,
                openDistance: value,
              })}
            </div>
          );
        })}
        <span
          className={`col-span-2 ${ROW_CLASS} font-semibold text-slate-900`}
        >
          合計
        </span>
        {renderValues(totalRow)}
      </div>
      {note && <p className="text-xs text-slate-600">{note}</p>}
    </section>
  );
}
