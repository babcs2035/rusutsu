"use server";

import {
  readTicketForEdit,
  validateTicketDocument,
  writeTicketFile,
} from "./server/ticketFiles";
import type {
  SaveTicketRequest,
  TicketActionResult,
  TicketDocument,
  TicketEditData,
  ValidationReport,
} from "./types";

export async function loadTicketForEdit(
  resortId: string,
  fileName: string,
): Promise<TicketEditData> {
  return readTicketForEdit(resortId, fileName);
}

export async function saveTicketFile(
  request: SaveTicketRequest,
): Promise<TicketActionResult> {
  return writeTicketFile(request);
}

/** 保存せずに Skill の検証3本だけを実行する */
export async function validateTicket(
  data: TicketDocument,
): Promise<ValidationReport> {
  return validateTicketDocument(data);
}
