import type { LiftTicketData, LiftTicketRental } from "../types";
import { buildReferences } from "./calculateLiftTicket";
import {
  ageLabelOf,
  type PriceCell,
  type PriceReference,
  type PriceRow,
  type PriceTable,
} from "./priceTable";

/**
 * 用具の行の名前。公式名称は「スキーセット 大人 1日」のように対象者・期間まで
 * 含むことがあり、行の見出しに使うと列・小行と重複するので、用具から付ける
 */
const ITEM_LABELS: Record<string, string> = {
  ski_set: "スキー3点セット",
  snowboard_set: "ボード2点セット",
  skis: "スキー板",
  ski_boots: "スキーブーツ",
  poles: "ストック",
  snowboard: "ボード板",
  snowboard_boots: "ボードブーツ",
  snowboard_bindings: "ビンディング",
  wear: "ウェア",
  helmet: "ヘルメット",
  goggles: "ゴーグル",
  gloves: "グローブ",
};

/** 行の並び順（スキー → ボード → ウェア → 小物 → その他） */
const ITEM_ORDER = [
  "ski_set",
  "skis",
  "ski_boots",
  "poles",
  "snowboard_set",
  "snowboard",
  "snowboard_boots",
  "snowboard_bindings",
  "wear",
  "helmet",
  "goggles",
  "gloves",
  "unknown",
];

const itemsLabelOf = (rental: LiftTicketRental) =>
  rental.items.includes("unknown")
    ? (rental.official_label_ja ?? rental.name_ja)
    : [...rental.items]
        .sort(
          (left, right) => ITEM_ORDER.indexOf(left) - ITEM_ORDER.indexOf(right),
        )
        .map(item => ITEM_LABELS[item] ?? item)
        .join("＋");

const orderOf = (rental: LiftTicketRental) =>
  Math.min(
    ...rental.items.map(item => {
      const index = ITEM_ORDER.indexOf(item);
      return index < 0 ? ITEM_ORDER.length : index;
    }),
  );

/** 小行の名前と並び順（短い期間から） */
const durationOf = (rental: LiftTicketRental) => {
  const {
    mode,
    hours,
    days,
    after_days: afterDays,
    start_time,
  } = rental.duration;
  switch (mode) {
    case "hours":
      return { label: `${hours}時間`, order: 10 + (hours ?? 0) };
    case "half_day":
      return {
        label: start_time ? `${start_time}〜` : "半日",
        order: 30,
      };
    case "night":
      return { label: "ナイター", order: 35 };
    case "day":
      return { label: "1日", order: 40 };
    case "days":
      return { label: `${days}日間`, order: 40 + (days ?? 0) };
    case "extra_day":
      return {
        label: `${(afterDays ?? 1) + 1}日目以降1日ごと`,
        order: 80 + (afterDays ?? 1),
      };
    default:
      return { label: "期間不明", order: 99 };
  }
};

/** 列見出し。券の区分と区別するための「（レンタル）」は表の中では要らない */
const columnLabelOf = (audience: { name_ja: string }) =>
  audience.name_ja.replace(/[（(]レンタル[）)]$/u, "");

/** 小物（セットに付いたり付かなかったりするもの）。行を分けず注記にする */
const ACCESSORIES = ["helmet", "goggles", "gloves"];

/** その料金の期間の名前（期間の切り替えに使う） */
export const rentalDurationLabelOf = (rental: LiftTicketRental) =>
  durationOf(rental).label;

export type RentalPriceTables = {
  base: PriceTable;
  conditional: PriceTable;
  /** 切り替えられる期間（短い順）。表は選んだ期間の料金だけを出す */
  durations: string[];
  references: PriceReference[];
};

/**
 * レンタル料金表。行＝用具（グレード・ショップ別）、列＝対象者。
 *
 * ★**期間（1日・5時間・2日間…）は小行にせず切り替えにする。** ルスツのように
 * 期間が7種類あると、小行に並べた表はスマホで縦に数千pxになる。
 * 平日・休日など日付で金額が変わる場合だけ小行にする。
 *
 * ★**ヘルメット等の小物だけが違うセットは同じ行にまとめる。** 「小学生以下は
 * ヘルメット無料」のセットを別の行にすると、大人と子供の行が半分ずつ空になる。
 * 全員に付く小物は行の名前に、一部の対象者だけに付く小物は注記に出す。
 *
 * 宿泊者限定など入力で判定できない料金は、リフト券と同じく別の表にする
 * （同じ表に並べると誰でもその値段で借りられると誤読される）
 */
export function buildRentalPriceTables(
  data: LiftTicketData,
  options: { duration?: string | null } = {},
): RentalPriceTables {
  const rentals = data.rentals ?? [];
  const { references, numberBySourceId } = buildReferences(data);
  const calendarById = new Map(
    data.calendars.map(calendar => [calendar.id, calendar]),
  );
  const channelById = new Map(
    data.channels.map(channel => [channel.id, channel]),
  );
  const audienceList = [...data.audiences, ...(data.rental_audiences ?? [])];
  const audienceNameOf = (id: string) => {
    const audience = audienceList.find(item => item.id === id);
    return audience ? (columnLabelOf(audience) ?? id) : id;
  };

  const durationOrder = new Map<string, number>();
  for (const rental of rentals) {
    const duration = durationOf(rental);
    durationOrder.set(duration.label, duration.order);
  }
  const durations = [...durationOrder.keys()].sort(
    (left, right) =>
      (durationOrder.get(left) ?? 0) - (durationOrder.get(right) ?? 0),
  );
  const selected =
    options.duration && durations.includes(options.duration)
      ? options.duration
      : durations.includes("1日")
        ? "1日"
        : (durations[0] ?? null);
  const inDuration = rentals.filter(
    rental => durationOf(rental).label === selected,
  );

  const buildTable = (subset: LiftTicketRental[]): PriceTable => {
    const usedAudiences = new Set<string>();
    type Draft = PriceRow & {
      order: number;
      core: string[];
      /** 対象者ごとの小物（全員共通なら行の名前に、違えば注記に出す） */
      accessoriesByAudience: Map<string, string[]>;
      sample: LiftTicketRental;
    };
    const rows = new Map<string, Draft>();
    const calendarLabels = new Set<string>();
    // ショップが1つだけなら、全行に同じショップ名を繰り返さない
    const showsShop =
      new Set(subset.map(rental => rental.shop_name_ja ?? "")).size > 1;
    for (const rental of subset) {
      const qualification = rental.target_qualification?.official_label_ja;
      const channel = (rental.channel_ids ?? [])
        .map(id => channelById.get(id)?.name_ja)
        .find(Boolean);
      const accessories = rental.items.filter(item =>
        ACCESSORIES.includes(item),
      );
      const core = rental.items.filter(item => !ACCESSORIES.includes(item));
      // 小物だけの料金（ヘルメット単品など）はそのまま1行
      const coreKey = core.length > 0 ? [...core].sort() : [...rental.items];
      const subLabel =
        [rental.grade_ja, showsShop ? rental.shop_name_ja : null]
          .filter(Boolean)
          .join("・") || null;
      const conditions = [
        qualification,
        channel &&
          [channel, rental.purchase_deadline?.official_text_ja]
            .filter(Boolean)
            .join("・"),
      ].filter((text): text is string => Boolean(text));
      const unknownLabel = rental.items.includes("unknown")
        ? (rental.official_label_ja ?? rental.name_ja)
        : null;
      const key = JSON.stringify([coreKey, unknownLabel, subLabel, conditions]);
      const row: Draft = rows.get(key) ?? {
        key,
        label: "",
        subLabel,
        conditions,
        notes: [],
        cells: new Map<string, PriceCell>(),
        spansAllAudiences: false,
        order: orderOf(rental),
        core: core.length > 0 ? core : [],
        accessoriesByAudience: new Map(),
        sample: rental,
      };
      rows.set(key, row);

      const calendars = (rental.calendar_ids ?? [])
        .map(id => calendarById.get(id)?.name_ja)
        .filter((name): name is string => Boolean(name));
      const calendarLabel = calendars.length > 0 ? calendars.join("・") : null;
      if (calendarLabel) calendarLabels.add(calendarLabel);
      for (const audienceId of rental.audience_ids ?? []) {
        usedAudiences.add(audienceId);
        row.accessoriesByAudience.set(
          audienceId,
          core.length > 0 ? accessories : [],
        );
        const cell = row.cells.get(audienceId) ?? { entries: [] };
        row.cells.set(audienceId, cell);
        const existing = cell.entries.find(
          entry => entry.calendarLabel === calendarLabel,
        );
        const amount = rental.price.amount ?? null;
        // 同じ区分に複数の料金があれば安いほうを出す
        if (existing && (amount == null || (existing.amount ?? 0) <= amount)) {
          continue;
        }
        const entry = {
          offerId: rental.id,
          calendarLabel,
          calendarPeriod: null,
          amount,
          text:
            amount == null
              ? "要確認"
              : amount === 0
                ? "無料"
                : amount.toLocaleString("ja-JP"),
          purchaseTag: null,
          counterAmount: null,
          sourceNumbers: [
            ...new Set(
              (rental.source_refs ?? [])
                .map(id => numberBySourceId.get(id))
                .filter((number): number is number => number != null),
            ),
          ].sort((left, right) => left - right),
        };
        if (existing) {
          cell.entries.splice(cell.entries.indexOf(existing), 1, entry);
        } else {
          cell.entries.push(entry);
        }
      }
    }

    // 列は基準区分（大人）を先頭に、その後はデータの並び順
    const audiences = audienceList
      .filter(audience => usedAudiences.has(audience.id))
      .sort(
        (left, right) =>
          Number(right.is_default === true) - Number(left.is_default === true),
      )
      .map(audience => ({
        id: audience.id,
        label: columnLabelOf(audience) ?? "",
        // 「12歳以下」のように名前に年齢があれば、補足の「〜12歳」は重ねない
        ageLabel: /歳|才/u.test(audience.name_ja) ? null : ageLabelOf(audience),
      }));

    const sortedRows = [...rows.values()]
      .sort((left, right) => left.order - right.order)
      .map(
        ({
          order: _order,
          core,
          accessoriesByAudience,
          sample,
          ...row
        }): PriceRow => {
          const lists = [...accessoriesByAudience.values()];
          const common = ACCESSORIES.filter(item =>
            lists.every(list => list.includes(item)),
          );
          const label =
            core.length > 0
              ? itemsLabelOf({ ...sample, items: [...core, ...common] })
              : itemsLabelOf(sample);
          // 一部の対象者だけに付く小物（「小学生はヘルメット付き」）
          const extras = new Map<string, string[]>();
          for (const [audienceId, list] of accessoriesByAudience) {
            const own = list.filter(item => !common.includes(item));
            if (own.length === 0) continue;
            const text = own.map(item => ITEM_LABELS[item] ?? item).join("・");
            extras.set(text, [...(extras.get(text) ?? []), audienceId]);
          }
          const notes = [...extras].map(
            ([text, audienceIds]) =>
              `${audienceIds.map(audienceNameOf).join("・")}は${text}付き`,
          );
          // 全員同じ金額なら、公式の表と同じくセルを結合して1つの金額にする
          const columns = audiences.map(audience => row.cells.get(audience.id));
          const first = columns[0]?.entries ?? [];
          const spansAllAudiences =
            audiences.length > 1 &&
            notes.length === 0 &&
            columns.every(
              cell =>
                cell != null &&
                cell.entries.length === first.length &&
                cell.entries.every(
                  (entry, index) =>
                    entry.calendarLabel === first[index]?.calendarLabel &&
                    entry.amount === first[index]?.amount,
                ),
            );
          return { ...row, label, notes, spansAllAudiences };
        },
      );
    return { audiences, rows: sortedRows };
  };

  return {
    base: buildTable(inDuration.filter(rental => !rental.target_qualification)),
    conditional: buildTable(
      inDuration.filter(rental => rental.target_qualification),
    ),
    durations,
    references,
  };
}
