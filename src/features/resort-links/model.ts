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

/** リンクを固定の型に並べる。リンクが無い種類も、位置をそろえるため空のまま残す */
export const groupResortLinks = (
  links: readonly ResortLinkItem[],
): ResortLinkGroupView[] => {
  const byType = new Map<string, ResortLinkItem[]>();
  // 同じ種類・同じURLでも、ラベルが違えば別のリンク（1ページに出発地が10か所並ぶアクセス案内など）。
  // ラベルまで同じものと、ラベル付きがあるのにラベル無しで重なるもの（旧データと新しいテーブルの両方にある場合）は1つにする
  const labeled = new Set(
    links.filter(link => link.label).map(link => `${link.type}\n${link.url}`),
  );
  const seen = new Set<string>();
  for (const link of links) {
    const page = `${link.type}\n${link.url}`;
    if (!link.label && labeled.has(page)) continue;
    const key = `${page}\n${link.label ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byType.get(link.type) ?? [];
    list.push(link);
    byType.set(link.type, list);
  }
  return RESORT_LINK_GROUPS.map(group => ({
    id: group.id,
    label: group.label,
    types: group.types.map(definition => ({
      ...definition,
      links: (byType.get(definition.type) ?? []).toSorted(
        (a, b) =>
          Number(a.source !== "official") - Number(b.source !== "official") ||
          a.sortOrder - b.sortOrder,
      ),
    })),
  }));
};
