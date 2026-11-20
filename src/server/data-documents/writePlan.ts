/** 正本書込の競合検出・内容の確定・実行順を，DB 接続から分ける． */
import { mapDocumentKind } from "@/server/course-lift/canonicalCodec";
import { cleanCourseDocumentContent } from "@/server/course-lift/retiredMetrics";
import {
  DataDocumentConflictError,
  type DataDocumentHashConflict,
} from "./contract";
import {
  type AtomicDataDocumentWrite,
  hashDataDocumentContent,
} from "./repositoryCore";

/** 全ての期待 hash が一致した場合に限り，入力順の保存内容を確定する． */
export function prepareDocumentWrites(
  documents: readonly AtomicDataDocumentWrite[],
  current: ReadonlyMap<string, { hash: string }>,
): AtomicDataDocumentWrite[] {
  const conflicts: DataDocumentHashConflict[] = [];
  for (const document of documents) {
    const actualHash = current.get(document.key)?.hash ?? document.fallbackHash;
    if (actualHash !== document.expectedHash)
      conflicts.push({
        key: document.key,
        expectedHash: document.expectedHash,
        actualHash,
      });
  }
  if (conflicts.length > 0) throw new DataDocumentConflictError(conflicts);
  return documents.map(document => {
    const content = cleanCourseDocumentContent(document.key, document.content);
    return content === document.content
      ? document
      : { ...document, content, hash: hashDataDocumentContent(content) };
  });
}

/** 地物の基礎行を先に書き，派生行・対応表・詳細行を後から反映する． */
export function orderDocumentWrites(
  documents: readonly AtomicDataDocumentWrite[],
): AtomicDataDocumentWrite[] {
  const rank = (key: string): number => {
    const kind = mapDocumentKind(key);
    if (!kind) return 0;
    if (kind.detail) return 4;
    if (kind.mapping) return 3;
    return kind.derived ? 2 : 1;
  };
  return [...documents].sort((a, b) => rank(a.key) - rank(b.key));
}
