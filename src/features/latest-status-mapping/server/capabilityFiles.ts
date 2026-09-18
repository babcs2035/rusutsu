import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  CapabilityConditionsSection,
  CapabilityOperationFields,
  CapabilityOperationSection,
  CapabilitySource,
  CapabilityWeatherFields,
  LatestStatusCapabilityFile,
} from "../types.capability";
import {
  CAPABILITY_OPERATION_KEYS,
  CAPABILITY_WEATHER_KEYS,
} from "../types.capability";

const RESORT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dataRoot = (): string => path.resolve(process.cwd(), "src/private/data");

const defaultTemporaryRoot = (): string =>
  path.join(dataRoot(), "resorts-temporary");

const usesCanonicalDocuments = (temporaryRoot: string): boolean =>
  path.resolve(temporaryRoot) === defaultTemporaryRoot();

export const capabilityPath = (
  temporaryRoot: string,
  resortId: string,
): string =>
  path.join(temporaryRoot, "latest_status_capability", `${resortId}.json`);

export const capabilityDocumentKey = (resortId: string): string =>
  `resorts-temporary/latest_status_capability/${resortId}.json`;

const emptyOperationFields = (): CapabilityOperationFields => ({
  name: false,
  status: false,
  update: false,
  note: false,
});

const emptyWeatherFields = (): CapabilityWeatherFields => ({
  update: false,
  weather: false,
  temperature: false,
  snowDepth: false,
  snowfall: false,
  condition: false,
  windSpeed: false,
});

const normalizeStringArray = (value: unknown, limit: number): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    seen.add(trimmed);
    if (seen.size >= limit) break;
  }
  return [...seen];
};

const normalizeOperationSection = (
  value: unknown,
): CapabilityOperationSection => {
  const source = isRecord(value) ? value : {};
  const rawFields = isRecord(source.fields) ? source.fields : {};
  const fields = emptyOperationFields();
  for (const key of CAPABILITY_OPERATION_KEYS) {
    fields[key] = rawFields[key] === true;
  }
  const names = normalizeStringArray(source.names, 2_000);
  return {
    available: source.available === true,
    count:
      typeof source.count === "number" && Number.isInteger(source.count)
        ? source.count
        : names.length,
    fields,
    names,
    statuses: normalizeStringArray(source.statuses, 20),
  };
};

const normalizeConditionsSection = (
  value: unknown,
): CapabilityConditionsSection => {
  const source = isRecord(value) ? value : {};
  const rawFields = isRecord(source.fields) ? source.fields : {};
  const fields = emptyWeatherFields();
  for (const key of CAPABILITY_WEATHER_KEYS) {
    fields[key] = rawFields[key] === true;
  }
  return {
    comment: source.comment === true,
    news: source.news === true,
    points: normalizeStringArray(source.points, 100),
    fields,
  };
};

const normalizeSource = (value: unknown): CapabilitySource => {
  const source = isRecord(value) ? value : {};
  return {
    mode: source.mode === "LIVE" ? "LIVE" : "WAYBACK_VALIDATION",
    archiveTimestamp:
      typeof source.archiveTimestamp === "string" &&
      /^\d{8}(?:\d{6})?$/u.test(source.archiveTimestamp)
        ? source.archiveTimestamp
        : null,
    urls: normalizeStringArray(source.urls, 20),
  };
};

export const parseCapabilityFile = (
  resortId: string,
  raw: string,
): LatestStatusCapabilityFile | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  return {
    version: 1,
    resortId: typeof parsed.resortId === "string" ? parsed.resortId : resortId,
    source: normalizeSource(parsed.source),
    observedAt:
      typeof parsed.observedAt === "string"
        ? parsed.observedAt
        : new Date(0).toISOString(),
    crawlerSourceHash:
      typeof parsed.crawlerSourceHash === "string" &&
      /^[0-9a-f]{64}$/u.test(parsed.crawlerSourceHash)
        ? parsed.crawlerSourceHash
        : null,
    courses: normalizeOperationSection(parsed.courses),
    lifts: normalizeOperationSection(parsed.lifts),
    conditions: normalizeConditionsSection(parsed.conditions),
  };
};

export const serializeCapabilityFile = (
  file: LatestStatusCapabilityFile,
): string => `${JSON.stringify(file, null, 2)}\n`;

export const readCapabilityFile = async (
  temporaryRoot: string,
  resortId: string,
): Promise<LatestStatusCapabilityFile | null> => {
  if (!RESORT_ID_PATTERN.test(resortId)) return null;
  const filePath = capabilityPath(temporaryRoot, resortId);
  let raw: string | null = null;
  if (usesCanonicalDocuments(temporaryRoot)) {
    const { getDataDocument } = await import("@/server/data-documents/client");
    raw =
      (await getDataDocument(capabilityDocumentKey(resortId)))?.content ?? null;
  } else {
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch {
      raw = null;
    }
  }
  return raw === null ? null : parseCapabilityFile(resortId, raw);
};

/**
 * 台帳を保存する。`expectedHash` を渡すと、読んだあとに誰かが書き換えていた場合に
 * 書き込みを中止する。新規作成では null を渡す。
 */
export const writeCapabilityFile = async (
  temporaryRoot: string,
  file: LatestStatusCapabilityFile,
  expectedHash: string | null = null,
): Promise<string> => {
  if (!RESORT_ID_PATTERN.test(file.resortId)) {
    throw new Error(`Invalid resort id: ${file.resortId}`);
  }
  const raw = serializeCapabilityFile(file);
  if (usesCanonicalDocuments(temporaryRoot)) {
    const { writeDataDocuments } = await import(
      "@/server/data-documents/client"
    );
    await writeDataDocuments([
      {
        key: capabilityDocumentKey(file.resortId),
        content: raw,
        mediaType: "application/json",
        expectedHash,
      },
    ]);
    return capabilityDocumentKey(file.resortId);
  }
  const filePath = capabilityPath(temporaryRoot, file.resortId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, raw, "utf8");
  return filePath;
};
