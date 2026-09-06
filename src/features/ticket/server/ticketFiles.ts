import type {
  DataDocument,
  DataDocumentSummary,
  DataDocumentWrite,
} from "@/server/data-documents/contract";
import { DataDocumentConflictError } from "@/server/data-documents/contract";
import type {
  SaveTicketRequest,
  TicketActionResult,
  TicketDocument,
  TicketEditData,
  TicketFileSummary,
  ValidationReport,
} from "../types";
import { validateTicketContent } from "./validateTicket";

const TICKET_PREFIX = "lift-ticket/";
const TICKET_DIRECTORY = "tickets";
const JSON_MEDIA_TYPE = "application/json";
const TICKET_READ_BATCH_SIZE = 16;

const RESORT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `2025-2026.json` / `2025-2026.draft.json` のような tickets/ 配下のファイル名 */
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.json$/;

const isValidResortId = (value: string) => RESORT_ID_PATTERN.test(value);

const isValidFileName = (value: string) =>
  FILE_NAME_PATTERN.test(value) && !value.includes("..");

const ticketDocumentKey = (resortId: string, fileName: string) => {
  if (!isValidResortId(resortId)) throw new Error("不正なスキー場IDです。");
  if (!isValidFileName(fileName)) throw new Error("不正なファイル名です。");
  return `${TICKET_PREFIX}${resortId}/${TICKET_DIRECTORY}/${fileName}`;
};

const ticketIdentityFromKey = (
  key: string,
): { resortId: string; fileName: string } | null => {
  const [root, resortId, directory, fileName, ...extra] = key.split("/");
  if (
    root !== "lift-ticket" ||
    directory !== TICKET_DIRECTORY ||
    extra.length > 0 ||
    !resortId ||
    !fileName ||
    !isValidResortId(resortId) ||
    !isValidFileName(fileName)
  ) {
    return null;
  }
  return { resortId, fileName };
};

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

export type TicketFileDataDocumentClient = {
  getDataDocument(key: string): Promise<DataDocument | null>;
  listDataDocuments(prefix?: string): Promise<DataDocumentSummary[]>;
  writeDataDocuments(
    documents: readonly DataDocumentWrite[],
  ): Promise<DataDocument[]>;
};

type TicketContentValidator = (content: string) => Promise<ValidationReport>;

// DataDocument 自体は module scope に保持しない。管理画面の各操作で正本を
// 読み直すため、DBへの切り替えや別プロセスによる更新が直ちに反映される。
const defaultDataDocumentClient: TicketFileDataDocumentClient = {
  async getDataDocument(key) {
    const { getDataDocument } = await import("@/server/data-documents/client");
    return getDataDocument(key);
  },
  async listDataDocuments(prefix) {
    const { listDataDocuments } = await import(
      "@/server/data-documents/client"
    );
    return listDataDocuments(prefix);
  },
  async writeDataDocuments(documents) {
    const { writeDataDocuments } = await import(
      "@/server/data-documents/client"
    );
    return writeDataDocuments(documents);
  },
};

/**
 * 編集できるファイルを列挙する。
 * `tickets/{season}.json`（確定）と `{season}.draft.json`（草案）の両方を
 * 対象にする — 人間が確認するのは草案の段階であることが多い。
 */
export const listTicketFiles = async (
  dataDocuments: TicketFileDataDocumentClient = defaultDataDocumentClient,
): Promise<TicketFileSummary[]> => {
  let documents: DataDocumentSummary[];
  try {
    documents = await dataDocuments.listDataDocuments(TICKET_PREFIX);
  } catch {
    return [];
  }

  const summaries: Array<TicketFileSummary | null> = [];
  for (
    let index = 0;
    index < documents.length;
    index += TICKET_READ_BATCH_SIZE
  ) {
    const batch = documents.slice(index, index + TICKET_READ_BATCH_SIZE);
    summaries.push(
      ...(await Promise.all(
        batch.map(async document => {
          const identity = ticketIdentityFromKey(document.key);
          if (!identity) return null;
          try {
            // list は内容を返さないため、DB優先＋bundled fallback が解決された
            // 現時点の文書を get し直す。
            const current = await dataDocuments.getDataDocument(document.key);
            if (!current) return null;
            const parsed = asRecord(JSON.parse(current.content));
            return parsed
              ? summarize(identity.resortId, identity.fileName, parsed)
              : null;
          } catch {
            // 壊れたJSONは一覧に出さない（開いても編集できない）
            return null;
          }
        }),
      )),
    );
  }
  return summaries.filter(
    (summary): summary is TicketFileSummary => summary !== null,
  );
};

export const readTicketForEdit = async (
  resortId: string,
  fileName: string,
  dataDocuments: TicketFileDataDocumentClient = defaultDataDocumentClient,
): Promise<TicketEditData> => {
  const document = await dataDocuments.getDataDocument(
    ticketDocumentKey(resortId, fileName),
  );
  if (!document) throw new Error("リフト券JSONが見つかりません。");
  const parsed = asRecord(JSON.parse(document.content));
  if (!parsed) throw new Error("リフト券JSONの形式が不正です。");
  return { resortId, fileName, data: parsed, fileHash: document.hash };
};

const conflictResult = (): TicketActionResult => ({
  ok: false,
  errors: [
    "読み込み後にファイルが変更されています。再読み込みしてから編集してください。",
  ],
  report: null,
});

export const writeTicketFile = async (
  request: SaveTicketRequest,
  dataDocuments: TicketFileDataDocumentClient = defaultDataDocumentClient,
  validateContent: TicketContentValidator = validateTicketContent,
): Promise<TicketActionResult> => {
  let key: string;
  try {
    key = ticketDocumentKey(request.resortId, request.fileName);
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

  let current: DataDocument | null;
  try {
    current = await dataDocuments.getDataDocument(key);
  } catch (error) {
    return {
      ok: false,
      errors: [`保存に失敗しました: ${String(error)}`],
      report: null,
    };
  }
  if (!current) {
    return {
      ok: false,
      errors: ["保存先のファイルが見つかりません。"],
      report: null,
    };
  }
  if (current.hash !== request.fileHash) return conflictResult();

  const content = serialize(record);

  // ★Skill の検証3本を通らないJSONは保存しない。
  // 構造とラベル体系の正本は Skill 側にあり、画面から壊せてはいけない。
  const report = await validateContent(content);
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

  try {
    // 競合確認と更新は DataDocument 側の同一トランザクションで行われる。
    // 将来複数文書へ拡張しても、このAPIの1回のbatchが原子的な単位になる。
    const [written] = await dataDocuments.writeDataDocuments([
      {
        key,
        content,
        mediaType: JSON_MEDIA_TYPE,
        expectedHash: request.fileHash,
      },
    ]);
    if (!written || written.key !== key) {
      throw new Error("保存結果に対象のリフト券JSONがありません。");
    }

    return {
      ok: true,
      data: {
        resortId: request.resortId,
        fileName: request.fileName,
        data: record,
        fileHash: written.hash,
      },
      report,
    };
  } catch (error) {
    if (error instanceof DataDocumentConflictError) return conflictResult();
    return {
      ok: false,
      errors: [`保存に失敗しました: ${String(error)}`],
      report,
    };
  }
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
