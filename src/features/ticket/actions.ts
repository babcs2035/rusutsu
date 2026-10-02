"use server";

import { requireEditor } from "@/lib/requireEditor";

import { assertBoundedPayload } from "@/server/edit-requests/contract";
import { runEdit } from "@/server/edit-requests/workflow";

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
  seasonId: string,
): Promise<TicketEditData> {
  await requireEditor();
  return readTicketForEdit(resortId, seasonId);
}

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
