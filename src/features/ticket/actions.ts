"use server";

import { requireAdmin } from "@/lib/requireAdmin";
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
  await requireAdmin();
  return readTicketForEdit(resortId, fileName);
}

export async function saveTicketFile(
  request: SaveTicketRequest,
): Promise<TicketActionResult> {
  await requireAdmin();
  return writeTicketFile(request);
}

/** 保存せずに Skill の検証3本だけを実行する */
export async function validateTicket(
  data: TicketDocument,
): Promise<ValidationReport> {
  await requireAdmin();
  return validateTicketDocument(data);
}
