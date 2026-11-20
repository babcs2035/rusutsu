// 収集したリンクのファイルを、データAPI経由で resort_links へ反映する。
// 既定は差分の確認だけ。--apply を付けたときだけ書き込む。
//   公式リンク: mise run resort-links:publish -- --official <resortId...> [--check | --apply]
//   外部サイト: mise run resort-links:publish -- --source <siteId...> [--apply] [--allow-shrink]
import { promises as fs } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  dropRowsCoveredByOfficial,
  externalSiteFileSchema,
  externalSiteRows,
  officialFileLinkItems,
  officialLinkFileSchema,
  officialLinkRows,
  type ResortLinkRow,
} from "../src/features/resort-links/convert";
import { legacyLinkItems } from "../src/features/resort-links/legacy";
import { liftTicketLinkItems } from "../src/features/resort-links/liftTicketLinks";
import type { ResortLinkItem } from "../src/features/resort-links/model";
import { normalizeInternalDataApiBaseUrl } from "../src/lib/internalDataApiBaseUrl";
import {
  RESORT_LINK_OFFICIAL_SOURCE,
  type ResortLinkReplace,
  resortLinkKey,
  resortLinkListResponseSchema,
  resortLinkReplaceResponseSchema,
  resortLinkReplaceSchema,
} from "../src/server/resort-links/contract";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const USAGE =
  "Usage: mise run resort-links:publish -- (--official <resortId...> | --source <siteId...>) [--check | --apply] [--allow-shrink] [--api <baseUrl>]";
const API_PATH = "/api/admin/resort-links";
export const OFFICIAL_LINKS_DIR = "src/private/data/resort-links";
export const EXTERNAL_LINKS_DIR = "src/private/data/tour-links";
const LIFT_TICKET_DIR = "src/private/data/lift-ticket";
const LEGACY_LINKS_FILE = "src/private/data/SkiResortLinks.json";
const OFFICIAL_EDITOR_ID = "collect-ski-resort-official-links";
const EXTERNAL_EDITOR_ID = "tour-links";

type Target = { kind: "official" | "source"; id: string };

const readJsonIfExists = async (file: string): Promise<unknown> => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

let legacyDocument: Promise<Record<string, unknown>> | null = null;

/**
 * 公式リンクのファイル以外で、そのスキー場の画面に公式として出るリンク
 * （リフト券データの最新シーズン・旧リンク文書）。外部サイトの行が公式と同じページかの判定に使う
 */
async function linksOwnedElsewhere(
  resortId: string,
): Promise<ResortLinkItem[]> {
  legacyDocument ??= readJsonIfExists(LEGACY_LINKS_FILE).then(
    value => (value ?? {}) as Record<string, unknown>,
  );
  const ticketDir = path.join(LIFT_TICKET_DIR, resortId);
  const season = (await fs.readdir(ticketDir).catch(() => []))
    .filter(name => /^\d{4}-\d{4}\.json$/u.test(name))
    .sort()
    .at(-1);
  const ticket = season
    ? ((await readJsonIfExists(path.join(ticketDir, season))) as Parameters<
        typeof liftTicketLinkItems
      >[0])
    : null;
  const legacy = (await legacyDocument)[resortId] as Parameters<
    typeof legacyLinkItems
  >[0];
  return [
    ...liftTicketLinkItems(ticket),
    ...legacyLinkItems(legacy).filter(link => link.source === "official"),
  ];
}

/** そのスキー場の、画面に公式として出るリンクすべて（外部サイトのリンクを外す判定に使う） */
async function officialLinksOf(resortId: string): Promise<ResortLinkItem[]> {
  const raw = await readJsonIfExists(
    path.join(OFFICIAL_LINKS_DIR, `${resortId}.json`),
  );
  const file = raw ? officialLinkFileSchema.safeParse(raw) : null;
  return [
    ...(await linksOwnedElsewhere(resortId)),
    ...(file?.success ? officialFileLinkItems(file.data) : []),
  ];
}

/** 件数が大きく減る入れ替えは、サイト側の不調で取り損ねた可能性が高いので止める */
export const shrinksTooMuch = (currentCount: number, nextCount: number) =>
  currentCount > 0 && nextCount < currentCount / 2;

async function readTarget(target: Target): Promise<{
  write: ResortLinkReplace;
  skipped: string[];
}> {
  if (target.kind === "official") {
    const file = officialLinkFileSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(OFFICIAL_LINKS_DIR, `${target.id}.json`),
          "utf8",
        ),
      ),
    );
    if (file.resortId !== target.id)
      throw new Error(`resortId がファイル名と違います: ${file.resortId}`);
    return {
      write: resortLinkReplaceSchema.parse({
        scope: {
          kind: "resort",
          resortId: target.id,
          source: RESORT_LINK_OFFICIAL_SOURCE,
        },
        editor: { kind: "skill", id: OFFICIAL_EDITOR_ID },
        links: officialLinkRows(file),
      }),
      skipped: file.items
        .filter(item => item.status === "unchecked")
        .map(item => `未確認: ${item.type}`),
    };
  }
  const file = externalSiteFileSchema.parse(
    JSON.parse(
      await fs.readFile(
        path.join(EXTERNAL_LINKS_DIR, `${target.id}.json`),
        "utf8",
      ),
    ),
  );
  if (file.siteId !== target.id)
    throw new Error(`siteId がファイル名と違います: ${file.siteId}`);
  // 公式が同じタブに同じページを持っていれば、外部サイトの行は入れない
  const rows = externalSiteRows(file);
  const officialLinks = new Map<string, ResortLinkItem[]>();
  for (const resortId of new Set(rows.map(row => row.resortId)))
    officialLinks.set(resortId, await officialLinksOf(resortId));
  const { kept, dropped } = dropRowsCoveredByOfficial(
    rows,
    target.id,
    resortId => officialLinks.get(resortId) ?? [],
  );
  return {
    write: resortLinkReplaceSchema.parse({
      scope: { kind: "source", source: target.id },
      editor: { kind: "crawler", id: EXTERNAL_EDITOR_ID },
      links: kept,
    }),
    skipped: [
      ...file.entries
        .filter(entry => entry.resortIds.length === 0)
        .map(entry => `スキー場に対応づかない: ${entry.name}`),
      ...dropped.map(
        row =>
          `公式に同じページがあるので外す: ${row.resortId} ${row.type} → ${row.coveredBy} ${row.url}`,
      ),
    ],
  };
}

async function main() {
  const targets: Target[] = [];
  let kind: Target["kind"] | null = null;
  let apply = false;
  let allowShrink = false;
  // --check はファイルの形式だけを見る（APIに繋がない）
  let checkOnly = false;
  let api = process.env.API_BASE_URL?.trim() ?? "";
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") continue;
    if (arg === "--official") kind = "official";
    else if (arg === "--source") kind = "source";
    else if (arg === "--apply") apply = true;
    else if (arg === "--check") checkOnly = true;
    else if (arg === "--allow-shrink") allowShrink = true;
    else if (arg === "--api" && args[i + 1]) api = args[++i];
    else if (!arg.startsWith("--") && kind) targets.push({ kind, id: arg });
    else throw new Error(USAGE);
  }
  if (targets.length === 0) throw new Error(USAGE);

  if (checkOnly) {
    let invalid = false;
    for (const target of targets) {
      try {
        const { write, skipped } = await readTarget(target);
        console.log(
          `${target.id}: 形式OK（反映する行 ${write.links.length}件${skipped.length ? `、${skipped.join("・")}` : ""}）`,
        );
      } catch (error) {
        invalid = true;
        console.error(
          `${target.id}: 形式エラー\n${error instanceof Error ? error.message : error}`,
        );
      }
    }
    if (invalid) process.exitCode = 1;
    return;
  }

  const baseUrl = normalizeInternalDataApiBaseUrl(api);
  const token = process.env.API_BEARER_TOKEN?.trim();
  if (!token)
    throw new Error("API_BEARER_TOKENを.env.localに設定してください。");
  const request = async (suffix: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${API_PATH}${suffix}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) return response.json();
    const body = await response.json().catch(() => null);
    const message = typeof body?.detail === "string" ? `\n${body.detail}` : "";
    throw new Error(
      response.status === 404
        ? `${baseUrl} にリンクのAPIがまだありません（デプロイ前）。`
        : `APIがHTTP ${response.status}を返しました。${message}`,
    );
  };

  let failed = false;
  for (const target of targets) {
    const name = `${target.kind === "official" ? "公式" : "外部"} ${target.id}`;
    try {
      const { write, skipped } = await readTarget(target);
      const query =
        write.scope.kind === "resort"
          ? new URLSearchParams({ resortIds: write.scope.resortId })
          : new URLSearchParams({ source: write.scope.source });
      const current = resortLinkListResponseSchema
        .parse(await request(`?${query}`))
        .links.filter(link => link.source === write.scope.source);
      const keyOf = (link: ResortLinkRow) => resortLinkKey(link);
      const currentKeys = new Set(current.map(keyOf));
      const nextKeys = new Set(write.links.map(keyOf));
      const added = write.links.filter(link => !currentKeys.has(keyOf(link)));
      const removed = current.filter(link => !nextKeys.has(keyOf(link)));
      console.log(
        `${name}: 今 ${current.length}件 → ${write.links.length}件（追加 ${added.length}・削除 ${removed.length}）`,
      );
      for (const link of added.slice(0, 5))
        console.log(
          `  + ${link.resortId} ${link.type} ${link.label ?? ""} ${link.url}`,
        );
      for (const link of removed.slice(0, 5))
        console.log(
          `  - ${link.resortId} ${link.type} ${link.label ?? ""} ${link.url}`,
        );
      for (const line of skipped.slice(0, 10)) console.log(`  ! ${line}`);

      if (!apply) continue;
      if (
        target.kind === "source" &&
        !allowShrink &&
        (write.links.length === 0 ||
          shrinksTooMuch(current.length, write.links.length))
      )
        throw new Error(
          "件数が半分未満に減ります。サイト側の不調でないか確かめ、正しければ --allow-shrink を付けてください。",
        );
      const { result } = resortLinkReplaceResponseSchema.parse(
        await request("", { method: "PUT", body: JSON.stringify(write) }),
      );
      console.log(`  反映しました: ${JSON.stringify(result)}`);
    } catch (error) {
      failed = true;
      console.error(
        `${name}: 失敗 ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  if (!apply) console.log("確認だけです。反映するには --apply を付けます。");
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename)
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
