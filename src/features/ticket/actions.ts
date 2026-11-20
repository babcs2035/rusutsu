"use server";

import * as editor from "./server/editorMutations";

/** ブラウザーから saveTicketFile の認可済み処理を呼び出す． */
export async function saveTicketFile(
  ...args: Parameters<typeof editor.saveTicketFile>
): ReturnType<typeof editor.saveTicketFile> {
  return editor.saveTicketFile(...args);
}

/** ブラウザーから validateTicket の認可済み処理を呼び出す． */
export async function validateTicket(
  ...args: Parameters<typeof editor.validateTicket>
): ReturnType<typeof editor.validateTicket> {
  return editor.validateTicket(...args);
}
