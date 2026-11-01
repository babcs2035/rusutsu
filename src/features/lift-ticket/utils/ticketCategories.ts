import { getResortLabelName } from "@/lib/resortAliases";
import type { LiftTicketData, LiftTicketProduct } from "../types";

/**
 * 料金タブで選ぶ券の種類。
 * - own: そのスキー場だけで使える券（「高鷲のみ」）
 * - pair: もう1か所と共通の券（「ダイナランド共通券」）
 * - multi: 3か所以上で共通の券（「TAKASU MOUNTAINS TICKET」）
 * どれに入るかは券の shared_with_resorts の数で決まる。
 */
export type TicketCategoryKind = "own" | "pair" | "multi";

export type TicketCategory = {
  key: string;
  kind: TicketCategoryKind;
  label: string;
  /** その券を売っているスキー場（同時表示の組の中のどれか） */
  resortId: string;
  /** 料金データを持つスキー場。計算・誤り報告の対象 */
  ownerId: string;
  /** その種類の券だけに絞ったシーズンごとの料金データ */
  seasons: LiftTicketData[];
};

export type TicketCategorySource = {
  resortId: string;
  nameJa: string;
  shortName: string | null;
  /** 同時表示の組で付けた表示名。なければ短縮名 */
  label?: string | null;
  seasons: LiftTicketData[];
};

type Partner = { id: string; nameJa: string };

const partnersOf = (product: LiftTicketProduct): Partner[] =>
  (product.shared_with_resorts ?? []).flatMap(partner => {
    const id =
      partner.resort_id ?? (partner.name_ja && `name:${partner.name_ja}`);
    return id ? [{ id, nameJa: partner.name_ja ?? id }] : [];
  });

/** その券だけを残した料金データ。券を参照しない設定（暦・人物区分など）はそのまま */
const withProducts = (season: LiftTicketData, productIds: Set<string>) => ({
  ...season,
  products: season.products.filter(product => productIds.has(product.id)),
  offers: season.offers.filter(offer => productIds.has(offer.product_id)),
});

/**
 * 「ニセコ全山共通 1日券」「ニセコ全山共通 12ポイント券」→「ニセコ全山共通」。
 * 共通部分が短すぎて名前にならないときは null
 */
export const commonProductName = (names: string[]) => {
  if (!names.length) return null;
  let prefix = names[0];
  for (const name of names.slice(1)) {
    let length = 0;
    while (
      length < prefix.length &&
      length < name.length &&
      prefix[length] === name[length]
    )
      length++;
    prefix = prefix.slice(0, length);
  }
  // 「1日券」と「12ポイント券」の「1」のような、途中で切れた数字や括弧を落とす
  const trimmed = prefix.replace(/[\s\d（(【［[・&＆×-]+$/u, "").trim();
  return trimmed.length >= 3 ? trimmed : null;
};

/**
 * 料金タブで選ぶ券の種類の一覧。同時表示中は組のスキー場をまとめて並べ、
 * 同じ顔ぶれの共通券は最初のスキー場（開いたスキー場）の料金データで1つにする。
 */
export function ticketCategoriesOf(
  sources: TicketCategorySource[],
): TicketCategory[] {
  const shown = new Map(
    sources.map(source => [
      source.resortId,
      source.label ??
        getResortLabelName(source.resortId, source.nameJa, source.shortName),
    ]),
  );
  const labelOf = (partner: Partner) =>
    shown.get(partner.id) ??
    (partner.id.startsWith("name:")
      ? partner.nameJa
      : getResortLabelName(partner.id, partner.nameJa));
  const combined = sources.length > 1;
  const categories = new Map<
    string,
    Omit<TicketCategory, "seasons" | "label"> & {
      productIds: Map<LiftTicketData, Set<string>>;
      productNames: string[];
      resorts: Partner[];
    }
  >();

  for (const source of sources) {
    for (const season of source.seasons) {
      const ownerId = season.resort.id;
      for (const product of season.products) {
        const partners = partnersOf(product).filter(
          partner => partner.id !== ownerId && partner.id !== source.resortId,
        );
        const kind: TicketCategoryKind =
          partners.length === 0
            ? "own"
            : partners.length === 1
              ? "pair"
              : "multi";
        const resorts = [
          { id: source.resortId, nameJa: source.nameJa },
          ...partners,
        ];
        const key =
          kind === "own"
            ? `own:${source.resortId}`
            : `shared:${resorts
                .map(resort => resort.id)
                .sort()
                .join(",")}`;
        let category = categories.get(key);
        if (category && category.ownerId !== ownerId) continue;
        if (!category) {
          category = {
            key,
            kind,
            resortId: source.resortId,
            ownerId,
            productIds: new Map(),
            productNames: [],
            resorts,
          };
          categories.set(key, category);
        }
        const ids = category.productIds.get(season) ?? new Set<string>();
        ids.add(product.id);
        category.productIds.set(season, ids);
        if (!category.productNames.includes(product.name_ja))
          category.productNames.push(product.name_ja);
      }
    }
  }

  const label = (
    category: NonNullable<ReturnType<typeof categories.get>>,
  ): string => {
    const [owner, ...partners] = category.resorts;
    if (category.kind === "own") return `${labelOf(owner)}のみ`;
    if (category.kind === "pair") {
      // 同時表示の2か所どうしの共通券は「共通券」で通じる
      if (combined && sources.length === 2 && shown.has(partners[0].id))
        return "共通券";
      // 3か所以上の組では相手の名前だけでは区別できないので、券名を使う
      return combined
        ? (commonProductName(category.productNames) ??
            `${category.resorts.map(labelOf).join("・")}共通券`)
        : `${labelOf(partners[0])}共通券`;
    }
    return (
      commonProductName(category.productNames) ??
      `${category.resorts.length}か所共通券`
    );
  };

  const order: Record<TicketCategoryKind, number> = {
    own: 0,
    pair: 1,
    multi: 2,
  };
  return [...categories.values()]
    .sort((left, right) => order[left.kind] - order[right.kind])
    .map(category => ({
      key: category.key,
      kind: category.kind,
      label: label(category),
      resortId: category.resortId,
      ownerId: category.ownerId,
      seasons: [...category.productIds].map(([season, ids]) =>
        withProducts(season, ids),
      ),
    }));
}
