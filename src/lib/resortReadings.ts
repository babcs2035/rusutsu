import SkiResortReadings from "@/private/data/SkiResortReadings.json";
import type {
  ResortReadingEntry,
  ResortReadingInfo,
} from "@/shared/types/resortReading";

const readingEntries = (SkiResortReadings as { resorts: ResortReadingEntry[] })
  .resorts;

const readingEntryById = new Map(
  readingEntries.map(entry => [entry.id, entry]),
);

/** ルビセグメントから読み（かな文字列）を組み立てる */
const buildReading = (entry: ResortReadingEntry) =>
  entry.ruby.map(segment => segment.ruby ?? segment.text).join("");

/**
 * スキー場IDに対応する読み情報（ルビ・読み・旧名称）を返す。
 * SkiResortReadings.json に未登録の場合は空の情報を返す。
 */
export function getResortReadingInfo(id: string): ResortReadingInfo {
  const entry = readingEntryById.get(id);
  if (!entry) {
    return { nameRuby: null, reading: null, formerNames: [] };
  }
  return {
    nameRuby: entry.ruby.length > 0 ? entry.ruby : null,
    reading: entry.ruby.length > 0 ? buildReading(entry) : null,
    formerNames: entry.formerNames ?? [],
  };
}
