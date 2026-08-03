/**
 * ticket_edit（リフト券料金JSONの編集画面）の型。
 *
 * ★このJSONの構造は collect-ski-lift-ticket-pricing Skill の
 * `references/lift-ticket.schema.json` が正本であり、**画面側で構造を
 * 二重定義しない**。フィールド定義はサーバー側で schema を読んで
 * {@link FieldSpec} に変換し、それを描画する（schemaが更新されれば
 * 画面のフォームも自動的に追従する）。
 *
 * そのため編集対象のデータは「解析したJSONそのまま」を保持する
 * （下手に型付きモデルへ詰め替えると、schemaに追加されたばかりの
 * フィールドを画面が黙って捨ててしまう）。更新は spread で行うので
 * **キー順序も元ファイルのまま保たれる**。
 */

export type TicketDocument = Record<string, unknown>;

/** 文字列フィールドの入力方法。schemaのpattern/formatから判定する */
export type StringFormat =
  | "text"
  | "id"
  | "url"
  | "date"
  | "time"
  | "date-time"
  | "version";

export type FieldSpec =
  | {
      kind: "string";
      nullable: boolean;
      format: StringFormat;
      enumValues: string[] | null;
      minLength: number | null;
    }
  | {
      kind: "number";
      nullable: boolean;
      integer: boolean;
      minimum: number | null;
      maximum: number | null;
      exclusiveMinimum: number | null;
    }
  | { kind: "boolean"; nullable: boolean }
  | { kind: "array"; nullable: boolean; items: FieldSpec; minItems: number }
  | {
      kind: "object";
      nullable: boolean;
      required: string[];
      fields: FieldEntry[];
    }
  /** schemaから解釈できなかった箇所。壊さないため読み取り専用にする */
  | { kind: "unsupported"; nullable: boolean };

export type FieldEntry = {
  key: string;
  description: string | null;
  spec: FieldSpec;
};

/** ルート（1ファイル全体）のフィールド定義 */
export type TicketSchemaSpec = Extract<FieldSpec, { kind: "object" }>;

/** taxonomy.json 由来のラベル説明。enumの選択肢に日本語名を出すために使う */
export type EnumLabelInfo = {
  labelJa: string | null;
  definitionJa: string | null;
};

/**
 * taxonomy の「群」1件。
 *
 * ★群ごとに分けて持つ必要がある。`unknown` のように**同じラベル名が複数の群に
 * 存在し、意味が違う**ため（discount_reasons の unknown は「割引理由が確定
 * できない」、school_levels の unknown は「学校区分が判読不能」）。
 * 平坦な辞書にすると別の群の説明を出してしまう。
 */
export type EnumLabelGroup = {
  name: string;
  labels: Record<string, EnumLabelInfo>;
};

export type EnumLabelCatalog = {
  groups: EnumLabelGroup[];
};

/** 編集対象ファイル1件（1スキー場 × 1シーズン × 1JSON） */
export type TicketFileSummary = {
  resortId: string;
  /** tickets/ 配下のファイル名（例: 2025-2026.json / 2025-2026.draft.json） */
  fileName: string;
  /** ファイル名から取り出したシーズンID（例: 2025-2026） */
  seasonId: string;
  isDraft: boolean;
  seasonLabelJa: string | null;
  status: string | null;
  offerCount: number;
  humanReviewCount: number;
  unresolvedCount: number;
};

export type TicketFileOption = TicketFileSummary & {
  /** SkiResort マスタの名称。無ければスキー場IDを出す */
  resortName: string;
};

export type ValidationIssue = {
  level: "error" | "warning";
  /** どの検証スクリプトが出したか（schema / taxonomy / coverage） */
  check: string;
  path: string;
  message: string;
};

export type ValidationReport = {
  /** 3本すべてがエラー0で終了したか */
  ok: boolean;
  issues: ValidationIssue[];
  /** 検証スクリプトを実行できなかった場合の理由 */
  failedToRun: string | null;
  checkedAt: string;
};

export type TicketEditData = {
  resortId: string;
  fileName: string;
  data: TicketDocument;
  fileHash: string;
};

export type SaveTicketRequest = {
  resortId: string;
  fileName: string;
  data: TicketDocument;
  fileHash: string;
};

export type TicketActionResult =
  | { ok: true; data: TicketEditData; report: ValidationReport }
  | { ok: false; errors: string[]; report: ValidationReport | null };

/** localStorage の下書き */
export type TicketEditDraft = {
  version: 1;
  resortId: string;
  fileName: string;
  fileHash: string;
  data: TicketDocument;
  updatedAt: string;
};
