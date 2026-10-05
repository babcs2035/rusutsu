import path from "node:path";
import type { Prisma } from "@prisma/client";
import {
  loadResortGeometryForMerge,
  TEMPORARY_RESORTS_ROOT,
} from "@/lib/finalizedResortGeojson";
import { canonicalBase, type RawGeoFeature } from "@/lib/resortMapMerge";
import { MAP_ENTITIES_MIGRATION_KEY } from "@/server/course-lift/migrationPlan";
import { syncMapEntities } from "@/server/course-lift/repository";
import { syncRecommendationDocuments } from "@/server/course-recommendations/projection";
import { dataDocumentWriteSchema } from "@/server/data-documents/contract";
import { hashDataDocumentContent } from "@/server/data-documents/repositoryCore";
import {
  featureIdentity,
  readCourseGrouping,
} from "@/shared/course-lift/identity";

const GEOMETRY_FOLDERS = [
  "slope_before",
  "slope_10m",
  "slope_before_osm",
  "slope_10m_osm",
  "lift_before",
  "lift_20m",
] as const;
const SOURCE_FOLDERS = [...GEOMETRY_FOLDERS, "slope_detail", "lift_detail"];
type Source = { id: string; nameJa: string };
type Document = { key: string; content: string };
const keyFor = (folder: string, id: string) =>
  `resorts-temporary/${folder}/${id}.${folder.endsWith("_detail") ? "json" : "geojson"}`;

const mappingKeyFor = (id: string) =>
  `resorts-temporary/latest_status_mapping/${id}.json`;

/** 既存の統合先は一式として保持する。統合元の読み取りも不要。 */
export async function ensureMergedGeometryDocuments(
  transaction: Prisma.TransactionClient,
  resortId: string,
  sources: Source[],
  options: { linked?: boolean } = {},
) {
  const existing = await transaction.dataDocument.findMany({
    where: {
      key: { in: GEOMETRY_FOLDERS.map(folder => keyFor(folder, resortId)) },
    },
    select: { key: true },
  });
  if (existing.length) return;
  const documents = await transaction.dataDocument.findMany({
    where: {
      key: {
        in: sources.flatMap(source =>
          SOURCE_FOLDERS.map(folder => keyFor(folder, source.id)),
        ),
      },
    },
    select: { key: true, content: true },
  });
  const merged = await buildMergedGeometryDocuments(
    resortId,
    sources,
    documents,
  );
  // 連携エリアは子のクローラーをそのまま使うので、子の名称対応表も引き継ぐ。
  if (options.linked && merged.length) {
    const mappingKey = mappingKeyFor(resortId);
    const [existingMapping, sourceMappings] = await Promise.all([
      transaction.dataDocument.findUnique({
        where: { key: mappingKey },
        select: { key: true },
      }),
      transaction.dataDocument.findMany({
        where: { key: { in: sources.map(source => mappingKeyFor(source.id)) } },
        select: { key: true, content: true },
      }),
    ]);
    const mapping = existingMapping
      ? null
      : buildLinkedStatusMappingDocument(
          resortId,
          sources,
          sourceMappings,
          merged,
        );
    if (mapping) merged.push(mapping);
  }
  if (merged.length) {
    await transaction.dataDocument.createMany({ data: merged });
    await syncRecommendationDocuments(
      transaction,
      merged.map(d => d.key),
    );
    const enabled = await transaction.canonicalDataMigration.findUnique({
      where: { key: MAP_ENTITIES_MIGRATION_KEY },
    });
    if (enabled)
      await syncMapEntities(
        transaction,
        merged
          .map(document => document.key)
          .filter(key => key !== mappingKeyFor(resortId)),
      );
  }
}

export async function buildMergedGeometryDocuments(
  resortId: string,
  sources: Source[],
  documents: Document[],
) {
  const byKey = new Map(
    documents.map(document => [document.key, document.content]),
  );
  const dataRoot = path.dirname(TEMPORARY_RESORTS_ROOT);
  const entries = await Promise.all(
    sources.map(async source => ({
      ...source,
      collections: await loadResortGeometryForMerge(source.id, {
        temporaryRoot: TEMPORARY_RESORTS_ROOT,
        documentLoader: async file =>
          byKey.get(path.relative(dataRoot, file).split(path.sep).join("/")) ??
          null,
      }),
    })),
  );

  // 別エリアの同名コースを同じコースとして扱わない。分割区間は一緒に改名する。
  const owners = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const [folder, features] of Object.entries(entry.collections)) {
      for (const feature of features) {
        const name = feature.properties.name;
        if (typeof name !== "string") continue;
        const key = `${folder.startsWith("lift") ? "lift" : "course"}:${canonicalBase(name)}`;
        const ids = owners.get(key) ?? new Set<string>();
        ids.add(entry.id);
        owners.set(key, ids);
      }
    }
  }

  return GEOMETRY_FOLDERS.flatMap(folder => {
    if (!entries.some(entry => entry.collections[folder]?.length)) return [];
    // 標高付きの線が一部だけにあっても、他の統合元の線を落とさない。
    const fallback =
      folder === "slope_10m"
        ? "slope_before"
        : folder === "slope_10m_osm"
          ? "slope_before_osm"
          : folder === "lift_20m"
            ? "lift_before"
            : folder;
    const features: RawGeoFeature[] = entries.flatMap(entry =>
      (entry.collections[folder] ?? entry.collections[fallback] ?? []).map(
        (feature, index) => {
          const name = feature.properties.name;
          const key =
            typeof name === "string"
              ? `${folder.startsWith("lift") ? "lift" : "course"}:${canonicalBase(name)}`
              : "";
          const label =
            sources.filter(source => source.nameJa === entry.nameJa).length > 1
              ? `${entry.nameJa} (${entry.id})`
              : entry.nameJa;
          const primaryFolder = folder
            .replace("slope_10m", "slope_before")
            .replace("lift_20m", "lift_before");
          const sourceId = featureIdentity(
            feature.properties,
            keyFor(primaryFolder, entry.id),
            index,
          );
          const group = readCourseGrouping(feature.properties.courseGrouping);
          return {
            ...feature,
            properties: {
              ...feature.properties,
              entityId: `merged:${resortId}:${sourceId}`,
              sourceEntityId: sourceId,
              ...(group
                ? {
                    courseGrouping: {
                      ...group,
                      id: `merged:${resortId}:${group.id}`,
                      name:
                        (owners.get(key)?.size ?? 0) > 1
                          ? `${label} / ${group.name}`
                          : group.name,
                    },
                    groupingReviewed: null,
                  }
                : {}),
              ...(typeof name === "string" && (owners.get(key)?.size ?? 0) > 1
                ? { name: `${label} / ${name}` }
                : {}),
            },
          };
        },
      ),
    );
    if (!features.length) return [];
    const document = dataDocumentWriteSchema.parse({
      key: keyFor(folder, resortId),
      content: JSON.stringify({ type: "FeatureCollection", features }),
      mediaType: "application/geo+json",
      expectedHash: null,
    });
    const { expectedHash: _expectedHash, ...stored } = document;
    return [
      { ...stored, hash: hashDataDocumentContent(stored.content), version: 1 },
    ];
  });
}

type MappingRow = {
  geometryId?: unknown;
  crawledName?: unknown;
  crawledNames?: unknown;
  geojsonName?: unknown;
};
type MappingSection = { sourceFile?: unknown; rows?: unknown };

const MAPPING_KINDS = [
  { kind: "courses", folders: ["slope_before", "slope_before_osm"] },
  { kind: "lifts", folders: ["lift_before"] },
] as const;

/**
 * 子の名称対応表を、統合した地図の線に合わせて1つにまとめる。
 * 線のIDは統合時の `merged:<親ID>:<元ID>` に、同名の衝突で改名した線は改名後の名前に直す。
 */
export function buildLinkedStatusMappingDocument(
  resortId: string,
  sources: Source[],
  sourceMappings: Document[],
  mergedDocuments: Document[],
) {
  const parse = (content: string | undefined) => {
    try {
      return content ? (JSON.parse(content) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const result: Record<string, unknown> = { version: 1 };
  for (const { kind, folders } of MAPPING_KINDS) {
    const features = folders.flatMap(folder => {
      const collection = parse(
        mergedDocuments.find(item => item.key === keyFor(folder, resortId))
          ?.content,
      );
      return Array.isArray(collection?.features)
        ? (collection.features as RawGeoFeature[])
        : [];
    });
    const nameByEntityId = new Map(
      features.flatMap(feature =>
        typeof feature.properties.entityId === "string" &&
        typeof feature.properties.name === "string"
          ? [[feature.properties.entityId, feature.properties.name]]
          : [],
      ),
    );
    const names = new Set(nameByEntityId.values());
    const rows: Record<string, unknown>[] = [];
    let sourceFile: string | null = null;
    for (const source of sources) {
      const section = parse(
        sourceMappings.find(item => item.key === mappingKeyFor(source.id))
          ?.content,
      )?.[kind] as MappingSection | undefined;
      if (!section || !Array.isArray(section.rows)) continue;
      if (!sourceFile && typeof section.sourceFile === "string")
        sourceFile = section.sourceFile;
      const label =
        sources.filter(item => item.nameJa === source.nameJa).length > 1
          ? `${source.nameJa} (${source.id})`
          : source.nameJa;
      for (const row of section.rows as MappingRow[]) {
        const geometryId =
          typeof row.geometryId === "string" && row.geometryId
            ? `merged:${resortId}:${row.geometryId}`
            : null;
        const geojsonName =
          typeof row.geojsonName === "string" ? row.geojsonName : null;
        const renamed =
          geojsonName && names.has(`${label} / ${geojsonName}`)
            ? `${label} / ${geojsonName}`
            : geojsonName;
        rows.push({
          ...row,
          ...(geometryId ? { geometryId } : {}),
          geojsonName:
            (geometryId ? nameByEntityId.get(geometryId) : null) ?? renamed,
        });
      }
    }
    if (rows.length)
      result[kind] = {
        sourceFile: sourceFile ?? "",
        updatedAt: new Date().toISOString(),
        rows,
      };
  }
  if (!result.courses && !result.lifts) return null;
  const document = dataDocumentWriteSchema.parse({
    key: mappingKeyFor(resortId),
    content: JSON.stringify(result, null, 2),
    mediaType: "application/json",
    expectedHash: null,
  });
  const { expectedHash: _expectedHash, ...stored } = document;
  return {
    ...stored,
    hash: hashDataDocumentContent(stored.content),
    version: 1,
  };
}
