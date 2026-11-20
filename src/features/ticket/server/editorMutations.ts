/** 編集申請と画面の更新が，同じ入力検証と保存処理を使う． */
import "server-only";

import { requireEditor } from "@/lib/requireEditor";

import { assertBoundedPayload } from "@/server/edit-requests/contract";
import { runEdit } from "@/server/edit-requests/workflow";
import type {
  SaveTicketRequest,
  TicketActionResult,
  TicketDocument,
  ValidationReport,
} from "../types";
import { validateTicketDocument, writeTicketFile } from "./ticketFiles";

export async function saveTicketFile(
  request: SaveTicketRequest,
): Promise<TicketActionResult> {
  return runEdit("ticket", request.resortId, request, async () => {
    return writeTicketFile(request);
  });
}

/** 保存せずに Skill の検証3本だけを実行する */
export async function validateTicket(
  data: TicketDocument,
): Promise<ValidationReport> {
  await requireEditor();
  assertBoundedPayload(data);
  return validateTicketDocument(data);
}
