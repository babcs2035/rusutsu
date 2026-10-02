// Server-only consumers use this request-local context. There is no global actor
// or mutable cross-request proposal state. Kept dependency-free for isolation tests.
import { AsyncLocalStorage } from "node:async_hooks";
import {
  type DataDocument,
  DataDocumentConflictError,
  dataDocumentBatchWriteSchema,
} from "@/server/data-documents/contract";
import { hashDataDocumentContent } from "@/server/data-documents/repositoryCore";
import type { EditPlan } from "./contract";

export type EditCapture = {
  plan: EditPlan;
  overlay: Map<string, DataDocument>;
  referencePlan?: EditPlan;
};
const captures = new AsyncLocalStorage<EditCapture>();
export const currentEditCapture = () => captures.getStore();
export async function collectEdit<T>(
  task: () => Promise<T>,
  baseline?: EditPlan,
) {
  const plan: EditPlan = {
    documents: [],
    beforeDocuments: baseline?.beforeDocuments ?? [],
    resort: null,
    ticket: null,
    elevations: [],
  };
  const context: EditCapture = {
    plan,
    overlay: new Map(),
    referencePlan: baseline,
  };
  const result = await captures.run(context, task);
  return { result, plan };
}
export function capturedDocument(
  key: string,
): { found: true; document: DataDocument | null } | null {
  const context = currentEditCapture();
  if (!context) return null;
  const overlay = context.overlay.get(key);
  if (overlay) return { found: true, document: overlay };
  const before = context.plan.beforeDocuments.find(item => item.key === key);
  if (before) return { found: true, document: before.document };
  return null;
}
export function recordDocument(key: string, document: DataDocument | null) {
  const context = currentEditCapture();
  if (!context) return;
  if (document?.source === "bundled")
    throw new Error("申請はDBに登録済みのデータを対象にしてください。");
  if (!context.plan.beforeDocuments.some(item => item.key === key))
    context.plan.beforeDocuments.push({ key, document });
}
export async function captureDocumentWrites(
  input: unknown,
  read: (key: string) => Promise<DataDocument | null>,
): Promise<DataDocument[] | null> {
  const context = currentEditCapture();
  if (!context) return null;
  const { documents } = dataDocumentBatchWriteSchema.parse({
    documents: input,
  });
  const written: DataDocument[] = [];
  for (const write of documents) {
    const current = await read(write.key);
    if ((current?.hash ?? null) !== write.expectedHash)
      throw new DataDocumentConflictError([
        {
          key: write.key,
          expectedHash: write.expectedHash,
          actualHash: current?.hash ?? null,
        },
      ]);
    const existing = context.plan.documents.find(
      item => item.key === write.key,
    );
    if (existing) {
      existing.content = write.content;
      existing.mediaType = write.mediaType;
    } else context.plan.documents.push({ ...write });
    const document: DataDocument = {
      ...write,
      hash: hashDataDocumentContent(write.content),
      version: (current?.version ?? 0) + 1,
      source: "database",
    };
    context.overlay.set(write.key, document);
    written.push(document);
  }
  return written;
}
