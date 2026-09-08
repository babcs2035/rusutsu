import path from "node:path";
import type { Prisma } from "@prisma/client";
import {
  loadResortGeometryForMerge,
  TEMPORARY_RESORTS_ROOT,
} from "@/lib/finalizedResortGeojson";
import { canonicalBase, type RawGeoFeature } from "@/lib/resortMapMerge";
import { dataDocumentWriteSchema } from "@/server/data-documents/contract";
import { hashDataDocumentContent } from "@/server/data-documents/repositoryCore";

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

/** 既存の統合先は一式として保持する。統合元の読み取りも不要。 */
export async function ensureMergedGeometryDocuments(
  transaction: Pick<Prisma.TransactionClient, "dataDocument">,
  resortId: string,
  sources: Source[],
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
  if (merged.length)
    await transaction.dataDocument.createMany({ data: merged });
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
        feature => {
          const name = feature.properties.name;
          const key =
            typeof name === "string"
              ? `${folder.startsWith("lift") ? "lift" : "course"}:${canonicalBase(name)}`
              : "";
          const label =
            sources.filter(source => source.nameJa === entry.nameJa).length > 1
              ? `${entry.nameJa} (${entry.id})`
              : entry.nameJa;
          return {
            ...feature,
            properties: {
              ...feature.properties,
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
