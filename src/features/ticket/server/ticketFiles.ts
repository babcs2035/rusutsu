import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  SaveTicketRequest,
  TicketActionResult,
  TicketDocument,
  TicketEditData,
  TicketFileSummary,
} from "../types";
import { validateTicketContent } from "./validateTicket";

const TICKET_ROOT = path.join(
  process.cwd(),
  "src",
  "private",
  "data",
  "lift-ticket",
);

const RESORT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `2025-2026.json` / `2025-2026.draft.json` のような tickets/ 配下のファイル名 */
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.json$/;

const isValidResortId = (value: string) => RESORT_ID_PATTERN.test(value);

const isValidFileName = (value: string) =>
  FILE_NAME_PATTERN.test(value) && !value.includes("..");

const ticketFilePath = (resortId: string, fileName: string) => {
  if (!isValidResortId(resortId)) throw new Error("不正なスキー場IDです。");
  if (!isValidFileName(fileName)) throw new Error("不正なファイル名です。");
  return path.join(TICKET_ROOT, resortId, "tickets", fileName);
};

const hashContent = (content: string) =>
  createHash("sha256").update(content).digest("hex");

/**
 * ★書き出し形式は既存ファイルと完全に同じ `JSON.stringify(data, null, 2)` ＋
 * 末尾改行にする。編集画面は解析したJSONをそのまま保持し、更新も spread で
 * 行うので**キー順序が変わらない**。結果として「読み込んで何も触らずに保存」は
 * バイト単位で元ファイルと一致し、実際に変更した箇所だけが差分に出る。
 */
const serialize = (data: TicketDocument) =>
  `${JSON.stringify(data, null, 2)}\n`;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const countArray = (value: unknown) =>
  Array.isArray(value) ? value.length : 0;

const summarize = (
  resortId: string,
  fileName: string,
  data: TicketDocument,
): TicketFileSummary => {
  const season = asRecord(data.season);
  const dataQuality = asRecord(data.data_quality);
  return {
    resortId,
    fileName,
    seasonId: fileName.replace(/\.draft\.json$/, "").replace(/\.json$/, ""),
    isDraft: fileName.endsWith(".draft.json"),
    seasonLabelJa:
      typeof season?.label_ja === "string" ? season.label_ja : null,
    status: typeof dataQuality?.status === "string" ? dataQuality.status : null,
    offerCount: countArray(data.offers),
    humanReviewCount: countArray(dataQuality?.human_review_required),
    unresolvedCount: countArray(dataQuality?.unresolved_questions),
  };
};

/**
 * 編集できるファイルを列挙する。
 * `tickets/{season}.json`（確定）と `{season}.draft.json`（草案）の両方を
 * 対象にする — 人間が確認するのは草案の段階であることが多い。
 */
export const listTicketFiles = async (): Promise<TicketFileSummary[]> => {
  let resortEntries: string[];
  try {
    resortEntries = (await fs.readdir(TICKET_ROOT, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && isValidResortId(entry.name))
      .map(entry => entry.name);
  } catch {
    return [];
  }

  const summaries: TicketFileSummary[] = [];
  for (const resortId of resortEntries) {
    const directory = path.join(TICKET_ROOT, resortId, "tickets");
    let fileNames: string[];
    try {
      fileNames = await fs.readdir(directory);
    } catch {
      continue;
    }
    for (const fileName of fileNames.sort()) {
      if (!isValidFileName(fileName)) continue;
      try {
        const raw = await fs.readFile(path.join(directory, fileName), "utf8");
        const parsed = asRecord(JSON.parse(raw));
        if (!parsed) continue;
        summaries.push(summarize(resortId, fileName, parsed));
      } catch {
        // 壊れたJSONは一覧に出さない（開いても編集できない）
      }
    }
  }
  return summaries;
};

export const readTicketForEdit = async (
  resortId: string,
  fileName: string,
): Promise<TicketEditData> => {
  const raw = await fs.readFile(ticketFilePath(resortId, fileName), "utf8");
  const parsed = asRecord(JSON.parse(raw));
  if (!parsed) throw new Error("リフト券JSONの形式が不正です。");
  return { resortId, fileName, data: parsed, fileHash: hashContent(raw) };
};

export const writeTicketFile = async (
  request: SaveTicketRequest,
): Promise<TicketActionResult> => {
  let filePath: string;
  try {
    filePath = ticketFilePath(request.resortId, request.fileName);
  } catch (error) {
    return { ok: false, errors: [String(error)], report: null };
  }

  const record = asRecord(request.data);
  if (!record) {
    return {
      ok: false,
      errors: ["リフト券JSONの形式が不正です。"],
      report: null,
    };
  }

  let currentRaw: string;
  try {
    currentRaw = await fs.readFile(filePath, "utf8");
  } catch {
    return {
      ok: false,
      errors: ["保存先のファイルが見つかりません。"],
      report: null,
    };
  }
  if (hashContent(currentRaw) !== request.fileHash) {
    return {
      ok: false,
      errors: [
        "読み込み後にファイルが変更されています。再読み込みしてから編集してください。",
      ],
      report: null,
    };
  }

  const content = serialize(record);

  // ★Skill の検証3本を通らないJSONは保存しない。
  // 構造とラベル体系の正本は Skill 側にあり、画面から壊せてはいけない。
  const report = await validateTicketContent(content);
  if (report.failedToRun !== null) {
    return { ok: false, errors: [report.failedToRun], report };
  }
  if (!report.ok) {
    return {
      ok: false,
      errors: [
        "検証エラーがあるため保存していません。下の検証結果を解消してください。",
      ],
      report,
    };
  }

  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, "utf8");
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    return {
      ok: false,
      errors: [`保存に失敗しました: ${String(error)}`],
      report,
    };
  }

  return {
    ok: true,
    data: {
      resortId: request.resortId,
      fileName: request.fileName,
      data: record,
      fileHash: hashContent(content),
    },
    report,
  };
};

/** 保存せずに検証だけ実行する（編集中の確認用） */
export const validateTicketDocument = async (data: TicketDocument) => {
  const record = asRecord(data);
  if (!record) {
    return {
      ok: false,
      issues: [],
      failedToRun: "リフト券JSONの形式が不正です。",
      checkedAt: new Date().toISOString(),
    };
  }
  return validateTicketContent(serialize(record));
};
