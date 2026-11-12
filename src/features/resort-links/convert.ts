import { z } from "zod";
import { OFFICIAL_SKILL_LINK_TYPES } from "./model";

/**
 * 収集したファイルを、resort_links へ入れる行に直す。
 * - 公式リンク: スキルが書く 1スキー場=1ファイル（src/private/data/resort-links/<id>.json）
 * - 外部サイト: クローラーが書く 1サイト=1ファイル（src/private/data/tour-links/<site>.json）
 */
export type ResortLinkRow = {
  resortId: string;
  type: string;
  category: string | null;
  label: string | null;
  url: string;
  note: string | null;
  sortOrder: number;
};

const httpUrl = z
  .string()
  .max(2_000)
  .refine(value => /^https?:\/\//u.test(value), "http(s) のURLです。");

const officialItemSchema = z
  .strictObject({
    type: z.string(),
    /** found=ある / none=調べたが公式に無い / unchecked=調べきれていない */
    status: z.enum(["found", "none", "unchecked"]),
    /** そのページのURL（飛び先なし） */
    url: httpUrl.optional(),
    /** 飛び先つきのURL。飛び先を決めるスクリプトが入れる */
    jumpUrl: httpUrl.optional(),
    /** 該当箇所の見出しなど、飛び先を決める手がかり */
    quote: z.string().max(200).optional(),
    selector: z.string().max(500).optional(),
    category: z.string().optional(),
    label: z.string().max(40).optional(),
    /** found は、画面でリンクの横に1行で出す利用者向けの一言（40字まで）。それ以外は無い・未確認の理由 */
    note: z.string().max(200).optional(),
    /** このリンクが載っていた公式ページ */
    foundOn: httpUrl.optional(),
    /** 監査の指摘を承知のうえで載せる理由（自動アクセスを拒否するサイトなど） */
    accept: z.string().max(200).optional(),
  })
  .superRefine((item, context) => {
    if (!OFFICIAL_SKILL_LINK_TYPES.includes(item.type))
      context.addIssue({
        code: "custom",
        path: ["type"],
        message: `公式リンクのスキルで集める種類ではありません: ${item.type}`,
      });
    if (item.status === "found" && !item.url)
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "found には url が必要です。",
      });
    if (item.status === "found" && (item.note?.length ?? 0) > 40)
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "found の note は40字までにします（画面に1行で出すため）。",
      });
    if (item.status !== "found" && (item.url || item.jumpUrl))
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "none / unchecked に url は書きません。",
      });
  });

export const officialLinkFileSchema = z
  .strictObject({
    resortId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    /** 調べた公式サイト（運営会社・自治体のサイト） */
    officialSites: z.array(httpUrl).min(1),
    items: z.array(officialItemSchema),
    /** 別の場所で管理しているリンク（SNS・マップなど）で気づいた修正候補。DBには入れない */
    legacyFindings: z
      .array(
        z.strictObject({
          type: z.string(),
          url: httpUrl.optional(),
          /** 気づいた公式ページ */
          foundOn: httpUrl.optional(),
          note: z.string().max(500),
        }),
      )
      .default([]),
    notes: z.array(z.string()).default([]),
  })
  .superRefine((file, context) => {
    // 全スキー場を同じ型にそろえるため、どの種類も「ある・無い・未確認」のどれかを必ず書く
    const written = new Set(file.items.map(item => item.type));
    const missing = OFFICIAL_SKILL_LINK_TYPES.filter(
      type => !written.has(type),
    );
    if (missing.length > 0)
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: `書かれていない種類があります: ${missing.join(", ")}`,
      });
  });
export type OfficialLinkFile = z.infer<typeof officialLinkFileSchema>;

const dedupe = (rows: ResortLinkRow[]): ResortLinkRow[] => {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = JSON.stringify([
      row.resortId,
      row.type,
      row.category,
      row.label,
      row.url,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const officialLinkRows = (file: OfficialLinkFile): ResortLinkRow[] =>
  dedupe(
    file.items.flatMap((item, index) =>
      item.status === "found" && item.url
        ? [
            {
              resortId: file.resortId,
              type: item.type,
              category: item.category ?? null,
              label: item.label ?? null,
              url: item.jumpUrl ?? item.url,
              note: item.note ?? null,
              sortOrder: index,
            },
          ]
        : [],
    ),
  );

export const externalSiteFileSchema = z.object({
  siteId: z.string(),
  siteName: z.string(),
  crawledAt: z.string(),
  entries: z.array(
    z.object({
      name: z.string(),
      url: httpUrl,
      kind: z.enum(["tour", "transportOnly"]),
      label: z.string().optional(),
      note: z.string().optional(),
      resortIds: z.array(z.string()),
      method: z.enum(["alias", "exact", "partial", "none"]),
    }),
  ),
});
export type ExternalSiteFile = z.infer<typeof externalSiteFileSchema>;

/**
 * サイト上の名前が「ルスツリゾート：リフト券パック（札幌市内⇒…）」のようにスキー場名から始まるときは、
 * スキー場名を落として区別に要る部分だけを残す（そのスキー場の画面に出すので重複になる）。
 */
export const siteLinkLabel = (
  label: string | undefined,
  resortName: string,
): string | null => {
  if (!label) return null;
  const escaped = resortName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    label
      .replace(
        new RegExp(`^(【[^】]*】)?\\s*${escaped}\\s*[：:]\\s*`, "u"),
        "$1",
      )
      .replace(/\s+/gu, " ")
      .trim() || null
  );
};

/**
 * ツアー会社サイトの結果を行にする。
 * ツアーは busTour、バス・電車だけのプランは公共交通のアクセス（transitAccess）へ回す。
 * 共通券など複数スキー場にまたがるリンクは、スキー場ごとに1行にする。
 */
export const externalSiteRows = (file: ExternalSiteFile): ResortLinkRow[] =>
  dedupe(
    file.entries.flatMap((entry, index) =>
      entry.resortIds.map(resortId => ({
        resortId,
        type: entry.kind === "tour" ? "busTour" : "transitAccess",
        category: null,
        label: siteLinkLabel(entry.label, entry.name),
        url: entry.url,
        // クローラーのメモ（「バスのみ」など）は種類とラベルで分かるので、画面には出さない
        note: null,
        sortOrder: index,
      })),
    ),
  );
