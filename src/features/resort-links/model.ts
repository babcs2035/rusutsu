import linkSourcesJson from "./linkSources.json";
import linkTypesJson from "./linkTypes.json";

/**
 * スキー場リンク一覧の固定の型。どのスキー場でも同じグループ・同じ並び順で出す。
 * 定義の正本は linkTypes.json（公式リンク収集スキルの検証スクリプトも同じファイルを読む）。
 */
export type ResortLinkOwner =
  | "officialSkill"
  | "externalCrawler"
  | "legacyLinks"
  | "statusCrawler"
  | "liftTicket"
  | "yukiMagi"
  | "derived";

export type ResortLinkTypeDefinition = {
  type: string;
  label: string;
  /** 同じページの種類を1つのボタンにまとめたときの短い名前（無ければ label） */
  shortLabel?: string;
  owners: ResortLinkOwner[];
  /** 画面では別の種類のボタンにまとめて出す（レンタル店はレンタル料金と同じページのことが多い） */
  displayAs?: string;
};

export type ResortLinkGroupDefinition = {
  id: string;
  label: string;
  /** 同じタブで別の種類が同じページを指すとき、まとめたボタンを置く種類と名前の順 */
  samePagePriority?: string[];
  /** false のタブ（ゲレンデ）は同じページでもまとめず、種類ごとにそのページの位置へ飛ぶ */
  mergeSamePage?: boolean;
  types: ResortLinkTypeDefinition[];
};

export const RESORT_LINK_GROUPS =
  linkTypesJson.groups as ResortLinkGroupDefinition[];

export const RESORT_LINK_TYPES: ResortLinkTypeDefinition[] =
  RESORT_LINK_GROUPS.flatMap(group => group.types);

const typeIndex = new Map(
  RESORT_LINK_TYPES.map((definition, index) => [definition.type, index]),
);

export const isKnownResortLinkType = (type: string) => typeIndex.has(type);

/** 公式リンク収集スキルが集める種類 */
export const OFFICIAL_SKILL_LINK_TYPES = RESORT_LINK_TYPES.filter(definition =>
  definition.owners.includes("officialSkill"),
).map(definition => definition.type);

/** 画面に出す1リンク。出どころ（公式・サイト名）が違っても同じ形にそろえる */
export type ResortLinkItem = {
  type: string;
  /** "official" か外部サイトのID */
  source: string;
  category: string | null;
  label: string | null;
  url: string;
  note: string | null;
  sortOrder: number;
};

/** 画面に出す1リンク。同じページを指す別の種類をまとめたときは mergedTypes にその種類が入る */
export type ResortLinkView = ResortLinkItem & { mergedTypes?: string[] };

export type ResortLinkGroupView = {
  id: string;
  label: string;
  types: Array<ResortLinkTypeDefinition & { links: ResortLinkView[] }>;
};

/** 会社名 → 外部サイトのID。公式ページが案内するツアー会社（label が会社名）を、クローラーのリンクと同じ会社にまとめる */
const SOURCE_BY_NAME = new Map(
  linkSourcesJson.sources
    .filter(source => source.id !== "official")
    .map(source => [source.name, source.id]),
);

/** 外部サイトのリンクを1社1件にする種類 */
const ONE_PER_SITE_TYPES = new Set(["busTour", "transitAccess"]);

/** 画面でその種類として出すときの種類（displayAs があればそちら） */
const displayType = new Map(
  RESORT_LINK_TYPES.map(definition => [
    definition.type,
    definition.displayAs ?? definition.type,
  ]),
);

/**
 * 同じページかどうかの比べ方。ページ内の位置（#…）・末尾の / や index.html・http/https・www は区別しない。
 * アソビューは商品番号で比べる（公式の掲載ページごとにチャネル番号が違うURLになる）。
 * 公式サイトは同じドメインなら1つ（/winter/ とトップのような重なり）。別ドメインの共同サイトは残す。
 */
export const linkPageKey = (type: string, url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
    if (type === "officialTop") return host;
    // アソビューは掲載元ごとのチャネル番号が違っても、商品番号が同じなら同じページ
    const asoview =
      host === "asoview.com" &&
      parsed.pathname.match(
        /\/(?:channel\/tickets?\/[^/]+|item\/ticket)\/(ticket\d+)/u,
      );
    if (asoview) return `asoview.com/ticket/${asoview[1]}`;
    const path = parsed.pathname
      .replace(/\/index\.(?:html?|php)$/u, "/")
      .replace(/\/+$/u, "");
    return `${host}${path}${parsed.search}`;
  } catch {
    return url;
  }
};

/**
 * 種類 → 画面のタブ（グループ）と、同じページをまとめたボタンを置く順（samePagePriority。無いタブは並び順）
 */
const typePlace = new Map(
  RESORT_LINK_GROUPS.flatMap(group => {
    const order =
      group.samePagePriority ?? group.types.map(definition => definition.type);
    return group.types.map(definition => [
      definition.type,
      {
        group: group.id,
        index: order.indexOf(definition.displayAs ?? definition.type),
        merge: group.mergeSamePage !== false,
      },
    ]);
  }),
);

/** 種類をまたいで同じページかを比べるキー（公式サイトもドメインではなくページで比べる） */
const crossTypePageKey = (url: string) => linkPageKey("", url);

export type CoveredLink<T extends Pick<ResortLinkItem, "type" | "url">> = {
  link: T;
  /** 同じページを持っている公式の種類 */
  coveredBy: string;
};

/**
 * 外部サイトのリンクのうち、同じタブで公式（リフト券データ・旧リンク・公式リンク）が同じページを持つもの。
 * 割引サイトのクローラーが、公式が案内している販売ページと同じものを返したときなどに外す
 */
export const findCoveredLinks = <
  T extends Pick<ResortLinkItem, "type" | "url" | "source">,
>(
  links: readonly T[],
): CoveredLink<T>[] => {
  const official = new Map<string, string>();
  for (const link of links) {
    const type = displayType.get(link.type) ?? link.type;
    const place = typePlace.get(type);
    if (!place || link.source !== "official") continue;
    const key = `${place.group}\n${crossTypePageKey(link.url)}`;
    if (!official.has(key)) official.set(key, type);
  }
  return links.flatMap(link => {
    const place = typePlace.get(displayType.get(link.type) ?? link.type);
    if (!place || link.source === "official") return [];
    const coveredBy = official.get(
      `${place.group}\n${crossTypePageKey(link.url)}`,
    );
    return coveredBy ? [{ link, coveredBy }] : [];
  });
};

const typeDefinitions = new Map(
  RESORT_LINK_TYPES.map(definition => [definition.type, definition]),
);

/** 1つのボタンにまとめたときの名前の決まり。長くなる組み合わせは短い呼び名にする */
const MERGED_NAMES: Array<{ types: string[]; name: string }> = [
  { types: ["skiSchool", "snowboardSchool"], name: "スクール" },
];
/** まとめた名前の長さの上限（スマホのパネルでもボタン1つが1行に収まる長さ） */
const MAX_MERGED_NAME_LENGTH = 18;

/**
 * 同じページを指す種類をまとめたボタンの名前（例: 「リフト券・レンタル・Web購入」「スクール・キッズ」）。
 * 長くなるときは先頭の名前と「ほか」にする
 */
export const mergedLinkName = (types: readonly string[]) => {
  let rest = [...types];
  const names: string[] = [];
  while (rest.length > 0) {
    const combo = MERGED_NAMES.find(({ types: set }) =>
      set.every(type => rest.includes(type)),
    );
    if (combo?.types.includes(rest[0])) {
      names.push(combo.name);
      rest = rest.filter(type => !combo.types.includes(type));
      continue;
    }
    const definition = typeDefinitions.get(rest[0]);
    names.push(definition?.shortLabel ?? definition?.label ?? rest[0]);
    rest = rest.slice(1);
  }
  const unique = [...new Set(names)];
  for (let count = unique.length; count >= 1; count--) {
    const text =
      unique.slice(0, count).join("・") + (count < unique.length ? "ほか" : "");
    if (text.length <= MAX_MERGED_NAME_LENGTH || count === 1) return text;
  }
  return unique[0] ?? "";
};

/**
 * 同じタブで別の種類が同じページを指す公式のリンクを、1つのボタンにまとめる。
 * ボタンは samePagePriority で先の種類に置き、後の種類は mergedTypes に入れる。
 * 飛び先（#…）が種類ごとに違うときはページの先頭にする。ゲレンデ（mergeSamePage: false）はまとめない
 */
const mergeSamePageAcrossTypes = (
  byType: Map<string, ResortLinkView[]>,
): void => {
  for (const group of RESORT_LINK_GROUPS) {
    if (group.mergeSamePage === false) continue;
    const order = (
      group.samePagePriority ?? group.types.map(definition => definition.type)
    ).filter(type => byType.has(type));
    const owner = new Map<string, ResortLinkView>();
    for (const type of order) {
      const kept: ResortLinkView[] = [];
      for (const link of byType.get(type) ?? []) {
        if (link.source !== "official") {
          kept.push(link);
          continue;
        }
        const key = crossTypePageKey(link.url);
        const first = owner.get(key);
        if (!first) {
          owner.set(key, link);
          kept.push(link);
          continue;
        }
        if (first.type === type) {
          kept.push(link);
          continue;
        }
        if (!first.mergedTypes?.includes(type))
          first.mergedTypes = [...(first.mergedTypes ?? []), type];
        if (first.url !== link.url) first.url = first.url.split("#")[0];
      }
      byType.set(type, kept);
    }
  }
};

/**
 * リンクを固定の型に並べる。同じ種類で同じページを指すリンクは1つにする
 * （出発地ごとに分けて登録された同じアクセスのページ、旧データと新しいテーブルの重なりなど）。
 * 同じタブで別の種類が同じページを指すときは1つのボタンにまとめる（ゲレンデを除く）。
 * 外部サイトのリンクは、同じタブで公式に同じページがあれば出さない（findCoveredLinks）。
 * まとめたリンクの区別の名前が食い違うときは名前を外す（1ページの案内なので名前で分けない）。
 */
export const groupResortLinks = (
  allLinks: readonly ResortLinkItem[],
): ResortLinkGroupView[] => {
  // 公式に同じページがある外部サイトのリンクは出さない
  const covered = new Set<ResortLinkItem>(
    findCoveredLinks(allLinks).map(({ link }) => link),
  );
  const links = allLinks.filter(link => !covered.has(link));
  const byType = new Map<
    string,
    Array<ResortLinkItem & { fromOfficial: boolean }>
  >();
  const byPage = new Map<string, ResortLinkItem & { fromOfficial: boolean }>();
  for (const original of links) {
    const type = displayType.get(original.type) ?? original.type;
    const siteOfLabel =
      type === "busTour" && original.source === "official" && original.label
        ? SOURCE_BY_NAME.get(original.label)
        : undefined;
    const link =
      type === original.type && !siteOfLabel
        ? original
        : siteOfLabel
          ? { ...original, type, source: siteOfLabel, label: null }
          : { ...original, type };
    // ツアー会社・バス会社は1社1件（志賀高原のように結合したスキー場で各社が複数のページを持っていても1つ）
    const page =
      ONE_PER_SITE_TYPES.has(type) && link.source !== "official"
        ? `${type}\n${link.source}\n${link.label ?? ""}`
        : `${type}\n${linkPageKey(type, link.url)}`;
    const kept = byPage.get(page);
    // 同じ会社なら、クローラーが取ったそのサイトのスキー場ページを公式ページ経由のリンクより優先する
    if (kept && siteOfLabel === undefined && kept.fromOfficial) {
      Object.assign(kept, link, { fromOfficial: false });
      continue;
    }
    if (kept) {
      if (link.label && !kept.label) kept.label = link.label;
      else if (link.label && kept.label !== link.label) kept.label = null;
      continue;
    }
    const copy = { ...link, fromOfficial: siteOfLabel !== undefined };
    byPage.set(page, copy);
    const list = byType.get(type) ?? [];
    list.push(copy);
    byType.set(type, list);
  }
  const views = new Map<string, ResortLinkView[]>(
    [...byType].map(([type, list]) => [
      type,
      list.map(({ fromOfficial: _fromOfficial, ...link }) => link),
    ]),
  );
  mergeSamePageAcrossTypes(views);
  return RESORT_LINK_GROUPS.map(group => ({
    id: group.id,
    label: group.label,
    types: group.types
      .filter(definition => !definition.displayAs)
      .map(definition => ({
        ...definition,
        links: (views.get(definition.type) ?? []).toSorted(
          (a, b) =>
            Number(a.source !== "official") - Number(b.source !== "official") ||
            a.sortOrder - b.sortOrder,
        ),
      })),
  }));
};
