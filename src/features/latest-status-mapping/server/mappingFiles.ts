import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { LatestSuccessfulStatus } from "@/lib/latestStatusFiles";
import { loadLatestSuccessfulStatus } from "@/lib/latestStatusFiles";
import type { DataDocumentWrite } from "@/server/data-documents/contract";
import type {
  LatestStatusMappingFile,
  LatestStatusMappingItem,
  LatestStatusMappingKind,
  LatestStatusMappingRow,
  LatestStatusMappingSection,
  LatestStatusMappingWorkspace,
  ResolvedLatestStatusMapping,
  SaveLatestStatusMappingRequest,
  SaveLatestStatusMappingResult,
} from "../types";
import { createSuggestedRows, reconcileSavedRows } from "../utils/rows";

const RESORT_ID_PATTERN = /^[a-z0-9-]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const hashContent = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

type DataDocumentLoader = (absoluteFilePath: string) => Promise<string | null>;

const dataRoot = (): string => path.resolve(process.cwd(), "src/private/data");

const defaultTemporaryRoot = (): string =>
  path.join(dataRoot(), "resorts-temporary");

const usesCanonicalDocuments = (temporaryRoot: string): boolean =>
  path.resolve(temporaryRoot) === defaultTemporaryRoot();

const dataDocumentKeyForPath = (absoluteFilePath: string): string | null => {
  const relativePath = path.relative(dataRoot(), absoluteFilePath);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  return relativePath.split(path.sep).join("/");
};

const readDataFile = async (
  temporaryRoot: string,
  filePath: string,
  documentLoader?: DataDocumentLoader,
): Promise<string | null> => {
  if (documentLoader) return documentLoader(filePath);
  if (usesCanonicalDocuments(temporaryRoot)) {
    const key = dataDocumentKeyForPath(filePath);
    if (!key) return null;
    const { getDataDocument } = await import("@/server/data-documents/client");
    return (await getDataDocument(key))?.content ?? null;
  }

  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

const mappingPath = (temporaryRoot: string, resortId: string): string =>
  path.join(temporaryRoot, "latest_status_mapping", `${resortId}.json`);

const geometryPaths = (
  temporaryRoot: string,
  resortId: string,
  kind: LatestStatusMappingKind,
): string[][] =>
  kind === "courses"
    ? [
        ["slope_10m", "slope_before"],
        ["slope_10m_osm", "slope_before_osm"],
      ].map(directories =>
        directories.map(directory =>
          path.join(temporaryRoot, directory, `${resortId}.geojson`),
        ),
      )
    : [[path.join(temporaryRoot, "lift_20m", `${resortId}.geojson`)]];

const normalizeRow = (value: unknown): LatestStatusMappingRow | null => {
  if (!isRecord(value)) return null;
  const crawledName = normalizeString(value.crawledName);
  const geojsonName = normalizeString(value.geojsonName);
  const geometryId = normalizeString(value.geometryId);
  if (crawledName === null && geojsonName === null && geometryId === null)
    return null;
  return { crawledName, geojsonName, ...(geometryId ? { geometryId } : {}) };
};

const normalizeSection = (
  value: unknown,
): LatestStatusMappingSection | undefined => {
  if (!isRecord(value)) return undefined;
  const sourceFile = normalizeString(value.sourceFile);
  const updatedAt = normalizeString(value.updatedAt);
  if (!sourceFile || !updatedAt || !Array.isArray(value.rows)) {
    return undefined;
  }
  return {
    sourceFile,
    updatedAt,
    rows: value.rows
      .map(normalizeRow)
      .filter((row): row is LatestStatusMappingRow => row !== null),
  };
};

const parseMappingFile = (raw: string): LatestStatusMappingFile => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return { version: 1 };
    return {
      version: 1,
      courses: normalizeSection(parsed.courses),
      lifts: normalizeSection(parsed.lifts),
    };
  } catch {
    return { version: 1 };
  }
};

const readMappingFile = async (
  temporaryRoot: string,
  resortId: string,
  documentLoader?: DataDocumentLoader,
): Promise<{
  data: LatestStatusMappingFile;
  raw: string | null;
  hash: string | null;
}> => {
  const raw = await readDataFile(
    temporaryRoot,
    mappingPath(temporaryRoot, resortId),
    documentLoader,
  );
  return raw === null
    ? { data: { version: 1 }, raw: null, hash: null }
    : { data: parseMappingFile(raw), raw, hash: hashContent(raw) };
};

const toStatusItem = (value: unknown): LatestStatusMappingItem | null => {
  if (!isRecord(value)) return null;
  const name = normalizeString(value.name);
  if (!name) return null;
  return {
    name,
    status: normalizeString(value.status),
    note: normalizeString(value.note),
    time: normalizeString(value.time) ?? normalizeString(value.update),
  };
};

const readLatestStatus = async (
  temporaryRoot: string,
  resortId: string,
  kind: LatestStatusMappingKind,
  latestStatusLoader?: (
    resortId: string,
    kind: LatestStatusMappingKind,
  ) => Promise<LatestSuccessfulStatus | null>,
): Promise<{
  archiveTimestamp?: string | null;
  fileName: string | null;
  time: string | null;
  items: LatestStatusMappingItem[];
  sourceUrls: string[];
}> => {
  const latest = latestStatusLoader
    ? await latestStatusLoader(resortId, kind)
    : await loadLatestSuccessfulStatus(temporaryRoot, resortId, kind);
  if (!latest) return { fileName: null, time: null, items: [], sourceUrls: [] };

  const itemsByName = new Map<string, LatestStatusMappingItem>();
  for (const sourceItem of latest.items) {
    const item = toStatusItem(sourceItem);
    if (item) itemsByName.set(item.name, item);
  }
  return {
    archiveTimestamp: latest.archiveTimestamp,
    fileName: latest.fileName,
    time: latest.time,
    items: [...itemsByName.values()],
    sourceUrls: latest.sourceUrls,
  };
};

const normalizeGeometryNames = (names: string[]): string[] => [
  ...new Set(
    names
      .map(name => normalizeString(name))
      .filter((name): name is string => name !== null),
  ),
];

const readGeometryNames = async (
  temporaryRoot: string,
  resortId: string,
  kind: LatestStatusMappingKind,
  documentLoader?: DataDocumentLoader,
): Promise<string[]> => {
  const names = new Set<string>();
  for (const sourcePaths of geometryPaths(temporaryRoot, resortId, kind)) {
    for (const filePath of sourcePaths) {
      try {
        const raw = await readDataFile(temporaryRoot, filePath, documentLoader);
        if (raw === null) continue;
        const parsed = JSON.parse(raw) as unknown;
        if (!isRecord(parsed) || !Array.isArray(parsed.features)) continue;
        for (const feature of parsed.features) {
          if (!isRecord(feature) || !isRecord(feature.properties)) continue;
          const name = normalizeString(feature.properties.name);
          if (name) names.add(name);
        }
        // 同じソースでは 10m を優先し、before と二重取りしない。
        break;
      } catch {
        // 同じソースの次のフォルダへフォールバックする
      }
    }
  }
  return [...names];
};

export const loadLatestStatusMappingWorkspace = async (
  temporaryRoot: string,
  resortId: string,
  kind: LatestStatusMappingKind,
  geojsonNamesOverride?: string[],
  latestStatusLoader?: (
    resortId: string,
    kind: LatestStatusMappingKind,
  ) => Promise<LatestSuccessfulStatus | null>,
): Promise<LatestStatusMappingWorkspace> => {
  if (!RESORT_ID_PATTERN.test(resortId)) {
    throw new Error(`不正なスキー場IDです: ${resortId}`);
  }

  const [latest, fileGeojsonNames, mapping] = await Promise.all([
    readLatestStatus(temporaryRoot, resortId, kind, latestStatusLoader),
    readGeometryNames(temporaryRoot, resortId, kind),
    readMappingFile(temporaryRoot, resortId),
  ]);
  const geojsonNames = geojsonNamesOverride
    ? normalizeGeometryNames(geojsonNamesOverride)
    : fileGeojsonNames;
  const section = mapping.data[kind];
  const crawledNames = latest.items.map(item => item.name);
  const rows = section
    ? reconcileSavedRows(kind, section.rows, crawledNames, geojsonNames)
    : createSuggestedRows(kind, crawledNames, geojsonNames);
  const warnings: string[] = [];

  if (!latest.fileName) {
    warnings.push("latest_data にクロール結果がありません。");
  } else if (latest.items.length === 0) {
    warnings.push(
      `${latest.fileName} に${kind === "courses" ? "コース" : "リフト"}情報がありません。`,
    );
  }
  if (geojsonNames.length === 0) {
    warnings.push(
      `${kind === "courses" ? "コースGeoJSON" : "lift_20m"} に名前付きの線がありません。`,
    );
  }
  if (section && section.sourceFile !== latest.fileName) {
    warnings.push(
      `保存後にクロール結果が更新されています（保存時: ${section.sourceFile} / 現在: ${latest.fileName ?? "なし"}）。対応を確認してください。`,
    );
  }

  const crawledNameSet = new Set(crawledNames);
  const geojsonNameSet = new Set(geojsonNames);
  if (
    section?.rows.some(
      row => row.crawledName && !crawledNameSet.has(row.crawledName),
    )
  ) {
    warnings.push("保存済み対応に、現在のクロール結果にない名前があります。");
  }
  if (
    section?.rows.some(
      row => row.geojsonName && !geojsonNameSet.has(row.geojsonName),
    )
  ) {
    warnings.push("保存済み対応に、現在の GeoJSON にない名前があります。");
  }

  return {
    kind,
    latestFile: latest.fileName,
    latestTime: latest.time,
    ...(latest.archiveTimestamp
      ? { archiveTimestamp: latest.archiveTimestamp }
      : {}),
    sourceUrls: latest.sourceUrls,
    crawledItems: latest.items,
    geojsonNames,
    rows,
    savedSourceFile: section?.sourceFile ?? null,
    savedAt: section?.updatedAt ?? null,
    mappingFileHash: mapping.hash,
    needsSave:
      section === undefined ||
      section.sourceFile !== latest.fileName ||
      JSON.stringify(section.rows) !== JSON.stringify(rows),
    warnings,
  };
};

const validateRows = async (
  temporaryRoot: string,
  request: SaveLatestStatusMappingRequest,
  latestStatusLoader?: (
    resortId: string,
    kind: LatestStatusMappingKind,
  ) => Promise<LatestSuccessfulStatus | null>,
): Promise<string[]> => {
  const errors: string[] = [];
  if (!RESORT_ID_PATTERN.test(request.resortId)) {
    errors.push(`不正なスキー場IDです: ${request.resortId}`);
    return errors;
  }
  if (!Array.isArray(request.rows) || request.rows.length > 2000) {
    errors.push("対応データの形式が不正です。");
    return errors;
  }

  const [latest, fileGeojsonNames] = await Promise.all([
    readLatestStatus(
      temporaryRoot,
      request.resortId,
      request.kind,
      latestStatusLoader,
    ),
    readGeometryNames(temporaryRoot, request.resortId, request.kind),
  ]);
  const geojsonNames = request.geojsonNames
    ? normalizeGeometryNames(request.geojsonNames)
    : fileGeojsonNames;
  if (latest.fileName !== request.latestFile) {
    errors.push(
      "画面を開いた後にクロール結果が更新されました。最新データを読み直してください。",
    );
  }

  const crawledNameSet = new Set(latest.items.map(item => item.name));
  const geojsonNameSet = new Set(geojsonNames);
  const mappedGeojsonNames = new Set<string>();
  const geometryById = new Map(
    (request.geometries ?? []).map(item => [item.id, item.name.trim()]),
  );
  const mappedIds = new Set<string>();
  const savedRows =
    (await readMappingFile(temporaryRoot, request.resortId)).data[request.kind]
      ?.rows ?? [];
  const unchangedOtherIds = new Map(
    savedRows
      .filter(row => row.geometryId && !geometryById.has(row.geometryId))
      .map(row => [row.geometryId, row]),
  );
  if (
    request.geometries &&
    (geometryById.size !== request.geometries.length ||
      request.geometries.some(item => !item.id || item.id.length > 1024))
  )
    errors.push("線IDの形式が不正です。");
  for (const [index, row] of request.rows.entries()) {
    const normalized = normalizeRow(row);
    if (!normalized) {
      errors.push(`${index + 1} 行目の対応データが空です。`);
      continue;
    }
    const unchangedOther = normalized.geometryId
      ? unchangedOtherIds.get(normalized.geometryId)
      : undefined;
    if (
      unchangedOther &&
      unchangedOther.geojsonName === normalized.geojsonName &&
      unchangedOther.crawledName === normalized.crawledName
    )
      continue;
    if (
      normalized.crawledName &&
      (!crawledNameSet.has(normalized.crawledName) ||
        normalized.crawledName.length > 300)
    ) {
      errors.push(`${index + 1} 行目のクロール名が現在のデータにありません。`);
    }
    if (normalized.geometryId) {
      const preserved = unchangedOtherIds.get(normalized.geometryId);
      if (
        preserved &&
        preserved.geojsonName === normalized.geojsonName &&
        preserved.crawledName === normalized.crawledName
      )
        continue;
      if (
        !geometryById.has(normalized.geometryId) ||
        (geometryById.get(normalized.geometryId) || null) !==
          normalized.geojsonName ||
        mappedIds.has(normalized.geometryId)
      )
        errors.push(`${index + 1} 行目の線IDが不正または重複しています。`);
      mappedIds.add(normalized.geometryId);
      if (normalized.geojsonName)
        mappedGeojsonNames.add(normalized.geojsonName);
      continue;
    }
    if (normalized.geojsonName) {
      if (
        !geojsonNameSet.has(normalized.geojsonName) ||
        normalized.geojsonName.length > 300
      ) {
        errors.push(
          `${index + 1} 行目の GeoJSON 名が現在のデータにありません。`,
        );
      }
      if (mappedGeojsonNames.has(normalized.geojsonName)) {
        errors.push(
          `GeoJSON 名「${normalized.geojsonName}」が重複しています。`,
        );
      }
      mappedGeojsonNames.add(normalized.geojsonName);
    }
  }

  for (const id of geometryById.keys()) {
    if (!mappedIds.has(id)) errors.push(`線ID「${id}」が対応表にありません。`);
  }
  for (const geojsonName of geojsonNames) {
    if (!mappedGeojsonNames.has(geojsonName)) {
      errors.push(`GeoJSON 名「${geojsonName}」が対応表にありません。`);
    }
  }
  return [...new Set(errors)];
};

export const prepareLatestStatusMappingDocument = async (
  temporaryRoot: string,
  request: SaveLatestStatusMappingRequest,
  latestStatusLoader?: (
    resortId: string,
    kind: LatestStatusMappingKind,
  ) => Promise<LatestSuccessfulStatus | null>,
): Promise<
  | { ok: true; document: DataDocumentWrite; savedAt: string }
  | { ok: false; errors: string[] }
> => {
  const errors = await validateRows(temporaryRoot, request, latestStatusLoader);
  if (errors.length > 0) return { ok: false, errors };

  const current = await readMappingFile(temporaryRoot, request.resortId);
  if (current.hash !== request.mappingFileHash) {
    return {
      ok: false,
      errors: [
        "画面を開いた後に対応表が更新されました。最新データを読み直してください。",
      ],
    };
  }

  const savedAt = new Date().toISOString();
  const data: LatestStatusMappingFile = {
    ...current.data,
    version: 1,
    [request.kind]: {
      sourceFile: request.latestFile,
      updatedAt: savedAt,
      rows: request.rows.map(row => ({
        ...(row.geometryId ? { geometryId: row.geometryId } : {}),
        crawledName: normalizeString(row.crawledName),
        geojsonName: normalizeString(row.geojsonName),
      })),
    },
  };
  const raw = `${JSON.stringify(data, null, 2)}\n`;
  return {
    ok: true,
    savedAt,
    document: {
      key: `resorts-temporary/latest_status_mapping/${request.resortId}.json`,
      content: raw,
      mediaType: "application/json",
      expectedHash: request.mappingFileHash,
    },
  };
};

export const saveLatestStatusMappingFile = async (
  temporaryRoot: string,
  request: SaveLatestStatusMappingRequest,
  latestStatusLoader?: (
    resortId: string,
    kind: LatestStatusMappingKind,
  ) => Promise<LatestSuccessfulStatus | null>,
): Promise<SaveLatestStatusMappingResult> => {
  const prepared = await prepareLatestStatusMappingDocument(
    temporaryRoot,
    request,
    latestStatusLoader,
  );
  if (!prepared.ok) return prepared;
  const raw = prepared.document.content;
  const savedAt = prepared.savedAt;
  const filePath = mappingPath(temporaryRoot, request.resortId);
  if (usesCanonicalDocuments(temporaryRoot)) {
    const key = dataDocumentKeyForPath(filePath);
    if (!key) {
      return { ok: false, errors: ["対応表の保存先が不正です。"] };
    }
    try {
      const { writeDataDocuments } = await import(
        "@/server/data-documents/client"
      );
      await writeDataDocuments([
        {
          key,
          content: raw,
          mediaType: "application/json",
          expectedHash: request.mappingFileHash,
        },
      ]);
    } catch (error) {
      const { DataDocumentConflictError } = await import(
        "@/server/data-documents/contract"
      );
      if (error instanceof DataDocumentConflictError) {
        return {
          ok: false,
          errors: [
            "画面を開いた後に対応表が更新されました。最新データを読み直してください。",
          ],
        };
      }
      throw error;
    }
  } else {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, raw, "utf8");
  }
  return {
    ok: true,
    savedAt,
    mappingFileHash: hashContent(raw),
    writtenFile: `latest_status_mapping/${request.resortId}.json`,
  };
};

export const readResolvedLatestStatusMapping = async (
  temporaryRoot: string,
  resortId: string,
  kind: LatestStatusMappingKind,
  documentLoader?: DataDocumentLoader,
): Promise<ResolvedLatestStatusMapping> => {
  if (!RESORT_ID_PATTERN.test(resortId)) {
    return {
      configured: false,
      sourceFile: null,
      byGeojsonName: new Map(),
    };
  }
  const section = (
    await readMappingFile(temporaryRoot, resortId, documentLoader)
  ).data[kind];
  if (!section) {
    return {
      configured: false,
      sourceFile: null,
      byGeojsonName: new Map(),
    };
  }
  // Legacy/unassociated derived lines may still have only a name. Use a name
  // fallback only if every assignment for that name agrees; never pick a sibling.
  const candidates = new Map<string, Set<string | null>>();
  for (const row of section.rows) {
    if (!row.geojsonName) continue;
    const values = candidates.get(row.geojsonName) ?? new Set<string | null>();
    values.add(row.crawledName);
    candidates.set(row.geojsonName, values);
  }
  return {
    configured: true,
    sourceFile: section.sourceFile,
    byGeometryId: new Map(
      section.rows.flatMap(row =>
        row.geometryId ? [[row.geometryId, row.crawledName]] : [],
      ),
    ),
    byGeojsonName: new Map(
      [...candidates].flatMap(([name, values]) =>
        values.size === 1 ? [[name, [...values][0]]] : [],
      ),
    ),
  };
};
