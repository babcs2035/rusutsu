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
  owners: ResortLinkOwner[];
  /** 画面では別の種類のボタンにまとめて出す（レンタル店はレンタル料金と同じページのことが多い） */
  displayAs?: string;
};

export type ResortLinkGroupDefinition = {
  id: string;
  label: string;
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

export type ResortLinkGroupView = {
  id: string;
  label: string;
  types: Array<ResortLinkTypeDefinition & { links: ResortLinkItem[] }>;
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
 * 公式サイトは同じドメインなら1つ（/winter/ とトップのような重なり）。別ドメインの共同サイトは残す。
 */
export const linkPageKey = (type: string, url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
    if (type === "officialTop") return host;
    const path = parsed.pathname
      .replace(/\/index\.(?:html?|php)$/u, "/")
      .replace(/\/+$/u, "");
    return `${host}${path}${parsed.search}`;
  } catch {
    return url;
  }
};

/**
 * リンクを固定の型に並べる。同じ種類で同じページを指すリンクは1つにする
 * （出発地ごとに分けて登録された同じアクセスのページ、旧データと新しいテーブルの重なりなど）。
 * まとめたリンクの区別の名前が食い違うときは名前を外す（1ページの案内なので名前で分けない）。
 */
export const groupResortLinks = (
  links: readonly ResortLinkItem[],
): ResortLinkGroupView[] => {
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
  return RESORT_LINK_GROUPS.map(group => ({
    id: group.id,
    label: group.label,
    types: group.types
      .filter(definition => !definition.displayAs)
      .map(definition => ({
        ...definition,
        links: (byType.get(definition.type) ?? [])
          .map(({ fromOfficial: _fromOfficial, ...link }) => link)
          .toSorted(
            (a, b) =>
              Number(a.source !== "official") -
                Number(b.source !== "official") || a.sortOrder - b.sortOrder,
          ),
      })),
  }));
};
