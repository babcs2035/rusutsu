import {
  DataDocumentConflictError,
  type DataDocumentWrite,
} from "@/server/data-documents/contract";
import { isValidResortId } from "./slopeFiles";

type ConfirmationStore = {
  getDataDocument: (
    key: string,
  ) => Promise<{ content: string; hash: string } | null>;
  writeDataDocuments: (
    documents: readonly DataDocumentWrite[],
  ) => Promise<unknown>;
};

const WRITE_ATTEMPTS = 3;
export const OSM_SLOPE_CONFIRMED_DOCUMENT_KEY =
  "resorts-temporary/slope_osm_confirmed.json";
const loadDataDocumentClient = () => import("@/server/data-documents/client");

const parseOsmSlopeConfirmedMap = (
  raw: string | null,
): Record<string, string> => {
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") map[key] = value;
    }
    return map;
  } catch {
    return {};
  }
};

export async function readOsmSlopeConfirmedMap(
  store?: ConfirmationStore,
): Promise<Record<string, string>> {
  const { getDataDocument } = store ?? (await loadDataDocumentClient());
  const document = await getDataDocument(OSM_SLOPE_CONFIRMED_DOCUMENT_KEY);
  return parseOsmSlopeConfirmedMap(document?.content ?? null);
}

export async function writeOsmSlopeConfirmed(
  resortId: string,
  confirmed: boolean,
  store?: ConfirmationStore,
): Promise<Record<string, string>> {
  if (!isValidResortId(resortId)) {
    throw new Error(`不正なスキー場IDです: ${resortId}`);
  }
  const { getDataDocument, writeDataDocuments } =
    store ?? (await loadDataDocumentClient());

  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
    const current = await getDataDocument(OSM_SLOPE_CONFIRMED_DOCUMENT_KEY);
    const map = parseOsmSlopeConfirmedMap(current?.content ?? null);
    if (confirmed) {
      map[resortId] = new Date().toISOString();
    } else {
      delete map[resortId];
    }
    const sorted = Object.fromEntries(
      Object.entries(map).sort(([a], [b]) => a.localeCompare(b)),
    );
    try {
      await writeDataDocuments([
        {
          key: OSM_SLOPE_CONFIRMED_DOCUMENT_KEY,
          content: `${JSON.stringify(sorted, null, 2)}\n`,
          mediaType: "application/json",
          expectedHash: current?.hash ?? null,
        },
      ]);
      return sorted;
    } catch (error) {
      if (
        error instanceof DataDocumentConflictError &&
        attempt < WRITE_ATTEMPTS
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("slope_osm_confirmed.json の保存を再試行できませんでした。");
}
