import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import type { RawGeoFeature } from "@/lib/resortMapMerge";
import { mergeCourseFeatures, mergeLiftFeatures } from "@/lib/resortMapMerge";
import {
  featureIdentity,
  legacyCourseGrouping,
  readCourseGrouping,
} from "@/shared/course-lift/identity";
import {
  CANONICAL_MAP_MIGRATION_KEY,
  courseAttributes,
  entityFeature,
  jsonValue,
  liftAttributes,
  mapDocumentKind,
  record,
  splitDerivedFeature,
  splitFeature,
} from "./canonicalCodec";
import {
  contentHash,
  type MapSourceDocument,
  readCollection,
} from "./migrationPlan";

type Tx = Prisma.TransactionClient;
export const canonicalMapsEnabled = async (tx: Tx) =>
  Boolean(
    await tx.canonicalDataMigration.findUnique({
      where: { key: CANONICAL_MAP_MIGRATION_KEY },
      select: { key: true },
    }),
  );

/** Compatibility format only: no full map/mapping document is stored. */
export async function readCanonicalMapDocument(
  tx: Tx,
  key: string,
): Promise<MapSourceDocument | null> {
  const kind = mapDocumentKind(key);
  if (!kind) return null;
  const state = await tx.mapDocumentState.findUnique({ where: { key } });
  if (!state?.relational) return null;
  let data: Record<string, unknown> | unknown[];
  if (kind.detail) {
    const rows =
      kind.kind === "course"
        ? await tx.mapCourse.findMany({
            where: {
              resortId: kind.resortId,
              sourceKind: "curated",
              archivedAt: null,
            },
          })
        : await tx.mapLift.findMany({
            where: { resortId: kind.resortId, archivedAt: null },
          });
    const order = record(state.metadata).rowOrder;
    data = (Array.isArray(order) ? order : []).flatMap(saved => {
      const item = record(saved);
      const raw = record(item.entry);
      const matches = rows.filter(row =>
        item.entityId
          ? row.id === item.entityId
          : raw.name && row.name === raw.name,
      );
      if (matches.length)
        return matches.map(row => entityFeature(row).properties);
      return item.entityId ? [] : [item.entry];
    });
  } else if (kind.mapping) {
    data = { version: 1 };
    for (const [section, model] of [
      ["courses", "mapCourse"],
      ["lifts", "mapLift"],
    ] as const) {
      const metadata = record(record(state.metadata)[section]);
      if (!metadata.sourceFile) continue;
      const rows =
        model === "mapCourse"
          ? await tx.mapCourse.findMany({
              where: { resortId: kind.resortId },
              select: {
                id: true,
                name: true,
                crawledNames: true,
                archivedAt: true,
              },
            })
          : await tx.mapLift.findMany({
              where: { resortId: kind.resortId },
              select: {
                id: true,
                name: true,
                crawledNames: true,
                archivedAt: true,
              },
            });
      const byId = new Map(rows.map(row => [row.id, row]));
      const order = Array.isArray(metadata.rowOrder) ? metadata.rowOrder : [];
      data[section] = {
        sourceFile: metadata.sourceFile,
        updatedAt: metadata.updatedAt,
        rows: order.map(entry => {
          const saved = record(entry);
          const row =
            typeof saved.geometryId === "string"
              ? byId.get(saved.geometryId)
              : null;
          if (!row) return saved;
          return {
            ...(!row.archivedAt ? { geometryId: row.id } : {}),
            geojsonName: row.archivedAt ? null : row.name,
            crawledName: row.crawledNames[0] ?? null,
            ...(row.crawledNames.length > 1
              ? { crawledNames: row.crawledNames }
              : {}),
          };
        }),
      };
    }
  } else {
    const where = {
      documentKey: kind.primaryKey,
      archivedAt: null,
      ...(kind.derived ? { derivedIndex: { not: null } } : {}),
    };
    const rows =
      kind.kind === "course"
        ? await tx.mapCourse.findMany({
            where,
            orderBy: kind.derived
              ? { derivedIndex: "asc" }
              : { sourceIndex: "asc" },
          })
        : await tx.mapLift.findMany({
            where,
            orderBy: kind.derived
              ? { derivedIndex: "asc" }
              : { sourceIndex: "asc" },
          });
    data = {
      ...record(state.metadata),
      type: "FeatureCollection",
      features: rows.map(row => entityFeature(row, kind.derived)),
    };
  }
  const content = `${JSON.stringify(data, null, 2)}\n`;
  return {
    key,
    content,
    hash: contentHash(content),
    mediaType: state.mediaType,
    version: state.version,
  };
}

export async function writeCanonicalMapDocument(
  tx: Tx,
  document: MapSourceDocument,
  movingKeys: Set<string>,
  options: { migrating?: boolean } = {},
) {
  const kind = mapDocumentKind(document.key);
  if (!kind) throw new Error(`Not a canonical map key: ${document.key}`);
  let metadata: Record<string, unknown>;
  let featureCount = 0;
  if (kind.detail) {
    const entries = JSON.parse(document.content) as unknown;
    if (!Array.isArray(entries))
      throw new Error("Detail document must contain an array");
    const rows =
      kind.kind === "course"
        ? await tx.mapCourse.findMany({
            where: {
              resortId: kind.resortId,
              sourceKind: "curated",
              archivedAt: null,
            },
          })
        : await tx.mapLift.findMany({
            where: { resortId: kind.resortId, archivedAt: null },
          });
    const rowOrder: unknown[] = [];
    for (const [index, entry] of entries.entries()) {
      const props = record(entry);
      const matches = rows.filter(row =>
        props.entityId
          ? row.id === props.entityId
          : props.name && row.name === props.name,
      );
      if (!matches.length) {
        rowOrder.push({ entry });
        continue;
      }
      for (const row of matches) {
        rowOrder.push({ entityId: row.id });
        if (!options.migrating) {
          const split = splitFeature(
            { type: "Feature", geometry: null, properties: props },
            kind.primaryKey,
            index,
          );
          const attrs =
            kind.kind === "course"
              ? courseAttributes(props)
              : liftAttributes(props);
          const fields = {
            name: split.fields.name,
            distance: split.fields.distance,
            ...(kind.kind === "course"
              ? {
                  difficulty: split.fields.difficulty,
                  angleAvg: split.fields.angleAvg,
                  angleMax: split.fields.angleMax,
                }
              : { type: split.fields.type, capacity: split.fields.capacity }),
            ...attrs,
          };
          const keyByColumn: Record<string, string> = {
            difficulty: "level",
            angleAvg: "avg",
            angleMax: "max",
          };
          const data = {
            ...Object.fromEntries(
              Object.entries(fields).filter(([key]) =>
                Object.hasOwn(props, keyByColumn[key] ?? key),
              ),
            ),
            properties: jsonValue({
              ...record(row.properties),
              ...split.properties,
            }),
          };
          if (kind.kind === "course")
            await tx.mapCourse.update({ where: { id: row.id }, data });
          else await tx.mapLift.update({ where: { id: row.id }, data });
        }
      }
    }
    metadata = { rowOrder };
    featureCount = entries.length;
  } else if (kind.mapping) {
    const input = record(JSON.parse(document.content));
    metadata = {};
    for (const [section, model] of [
      ["courses", "mapCourse"],
      ["lifts", "mapLift"],
    ] as const) {
      const saved = record(input[section]);
      if (!Array.isArray(saved.rows)) continue;
      const entities =
        model === "mapCourse"
          ? await tx.mapCourse.findMany({
              where: { resortId: kind.resortId, archivedAt: null },
              select: { id: true, name: true },
            })
          : await tx.mapLift.findMany({
              where: { resortId: kind.resortId, archivedAt: null },
              select: { id: true, name: true },
            });
      if (model === "mapCourse")
        await tx.mapCourse.updateMany({
          where: { resortId: kind.resortId },
          data: { crawledNames: [], mappingAssigned: false },
        });
      else
        await tx.mapLift.updateMany({
          where: { resortId: kind.resortId },
          data: { crawledNames: [], mappingAssigned: false },
        });
      const rowOrder: Record<string, unknown>[] = [];
      const assigned = new Set<string>();
      for (const inputRow of saved.rows) {
        const row = record(inputRow);
        const names = [
          ...new Set(
            [
              row.crawledName,
              ...(Array.isArray(row.crawledNames) ? row.crawledNames : []),
            ]
              .filter(
                (value): value is string =>
                  typeof value === "string" && value.trim() !== "",
              )
              .map(value => value.trim()),
          ),
        ];
        const matches = entities.filter(entity =>
          row.geometryId
            ? entity.id === row.geometryId
            : row.geojsonName && entity.name === row.geojsonName,
        );
        if (!matches.length) {
          rowOrder.push(row);
          continue;
        }
        for (const entity of matches) {
          if (assigned.has(entity.id))
            throw new Error(`Duplicate mapping assignment: ${entity.id}`);
          assigned.add(entity.id);
          const data = { crawledNames: names, mappingAssigned: true };
          if (model === "mapCourse")
            await tx.mapCourse.update({ where: { id: entity.id }, data });
          else await tx.mapLift.update({ where: { id: entity.id }, data });
          rowOrder.push({ geometryId: entity.id });
        }
      }
      metadata[section] = {
        sourceFile: saved.sourceFile,
        updatedAt: saved.updatedAt,
        rowOrder,
      };
    }
  } else {
    const collection = readCollection(document.content);
    const { features: originalFeatures, ...rest } = collection;
    let features = originalFeatures;
    if (!kind.derived && kind.sourceKind === "curated") {
      const baseKeys =
        kind.kind === "course"
          ? [
              "level",
              "piste",
              "snowboard",
              "avg",
              "max",
              "distance",
              "image",
              "searchWord",
            ]
          : [
              "type",
              "speed",
              "capacity",
              "hood",
              "distance",
              "vertical",
              "searchWord",
            ];
      if (
        features.some(feature =>
          baseKeys.some(key => !Object.hasOwn(record(feature.properties), key)),
        )
      ) {
        const detailKey = `resorts-temporary/${kind.kind === "course" ? "slope_detail" : "lift_detail"}/${kind.resortId}.json`;
        const detail = await readMapOrDataDocument(tx, detailKey);
        const items = detail ? JSON.parse(detail.content) : [];
        if (Array.isArray(items) && items.length) {
          const input = {
            geometryFeatures: features.map(feature => ({
              ...feature,
              properties: record(feature.properties),
              geometry: feature.geometry as RawGeoFeature["geometry"],
            })),
            baseItems: items.map(record),
            statusItems: [],
            baseSourceLabel: "detail",
            hasStatusSource: false,
            validateBaseFields: false,
          };
          const merged =
            kind.kind === "course"
              ? mergeCourseFeatures(input)
              : mergeLiftFeatures(input);
          features = merged.features.map((feature, index) => ({
            ...feature,
            properties: {
              ...feature.properties,
              ...record(originalFeatures[index].properties),
              name: originalFeatures[index].properties?.name,
              entityId: originalFeatures[index].properties?.entityId,
            },
          }));
        }
      }
    }
    metadata = rest;
    featureCount = features.length;
    const ids = new Set<string>();
    const groupDefinitions = new Map<string, string>();
    const groupOrders = new Set<string>();
    for (const [index, feature] of features.entries()) {
      const props = record(feature.properties);
      let id = featureIdentity(props, kind.primaryKey, index);
      if (kind.derived && !props.entityId) {
        const matches =
          kind.kind === "course"
            ? await tx.mapCourse.findMany({
                where: {
                  documentKey: kind.primaryKey,
                  name: typeof props.name === "string" ? props.name : null,
                  archivedAt: null,
                },
                select: { id: true },
              })
            : await tx.mapLift.findMany({
                where: {
                  documentKey: kind.primaryKey,
                  name: typeof props.name === "string" ? props.name : null,
                  archivedAt: null,
                },
                select: { id: true },
              });
        if (matches.length !== 1)
          throw new Error(
            `Derived line has no unique base: ${document.key} #${index}`,
          );
        id = matches[0].id;
      }
      if (ids.has(id)) throw new Error(`Duplicate map entity: ${id}`);
      ids.add(id);
      if (kind.derived) {
        const row =
          kind.kind === "course"
            ? await tx.mapCourse.findUnique({ where: { id } })
            : await tx.mapLift.findUnique({ where: { id } });
        if (!row || row.documentKey !== kind.primaryKey)
          throw new Error(`Derived line has no base: ${id}`);
        const split = splitDerivedFeature(feature, index);
        const data = {
          ...split,
          derivedGeometry: jsonValue(split.derivedGeometry),
          derivedProperties: jsonValue(split.derivedProperties),
          derivedMetadata: jsonValue(split.derivedMetadata),
          feature: Prisma.DbNull,
          derivedFeature: Prisma.DbNull,
        };
        if (kind.kind === "course")
          await tx.mapCourse.update({ where: { id }, data });
        else await tx.mapLift.update({ where: { id }, data });
        continue;
      }
      const split = splitFeature(feature, document.key, index);
      const old =
        kind.kind === "course"
          ? await tx.mapCourse.findUnique({ where: { id } })
          : await tx.mapLift.findUnique({ where: { id } });
      if (
        old &&
        old.documentKey !== document.key &&
        !movingKeys.has(old.documentKey)
      )
        throw new Error(`Entity ${id} belongs to another document`);
      const invalidated =
        old && !isDeepStrictEqual(old.geometry, split.geometry)
          ? {
              derivedGeometry: Prisma.DbNull,
              derivedIndex: null,
              elevationReady: false,
              horizontalDistance: null,
              slopeDistance: null,
              elevationDifference: null,
              calculatedAverageSlope: null,
              calculatedMaxSlope: null,
            }
          : {};
      const baseMetrics = split.baseMetrics;
      const baseElevation =
        !old || old.derivedIndex === null || Object.keys(invalidated).length
          ? {
              elevationReady: baseMetrics.elevationReady,
              horizontalDistance: baseMetrics.horizontalDistance,
              slopeDistance: baseMetrics.slopeDistance,
              elevationDifference: baseMetrics.elevationDifference,
              calculatedAverageSlope: baseMetrics.calculatedAverageSlope,
              calculatedMaxSlope: baseMetrics.calculatedMaxSlope,
            }
          : {};
      const common = {
        ...invalidated,
        ...baseElevation,
        resortId: kind.resortId,
        documentKey: document.key,
        sourceIndex: index,
        name: split.fields.name,
        distance: split.fields.distance,
        properties: jsonValue(split.properties),
        geometry: jsonValue(split.geometry),
        geometryType:
          typeof record(split.geometry).type === "string"
            ? String(record(split.geometry).type)
            : null,
        featureMetadata: jsonValue(split.metadata),
        feature: Prisma.DbNull,
        derivedFeature: Prisma.DbNull,
        archivedAt: null,
      };
      if (kind.kind === "course") {
        const group =
          readCourseGrouping(props.courseGrouping) ??
          (!Object.hasOwn(props, "courseGrouping")
            ? legacyCourseGrouping(
                String(props.name ?? ""),
                `${kind.resortId}:${kind.sourceKind}`,
              )
            : null);
        if (props.courseGrouping != null && !group)
          throw new Error(`Invalid grouping: ${id}`);
        if (group) {
          const definition = JSON.stringify([group.name, group.kind]);
          if (
            groupDefinitions.has(group.id) &&
            groupDefinitions.get(group.id) !== definition
          )
            throw new Error(`Inconsistent group definition: ${group.id}`);
          groupDefinitions.set(group.id, definition);
          const order = `${group.id}:${group.order}`;
          if (groupOrders.has(order))
            throw new Error(`Duplicate section order: ${order}`);
          groupOrders.add(order);
          const existing = await tx.mapCourseGroup.findUnique({
            where: { id: group.id },
          });
          if (
            existing &&
            (existing.resortId !== kind.resortId ||
              existing.sourceKind !== kind.sourceKind)
          )
            throw new Error("Group belongs to another resort/source");
          const data = {
            resortId: kind.resortId,
            sourceKind: kind.sourceKind,
            name: group.name,
            kind: group.kind,
          };
          await tx.mapCourseGroup.upsert({
            where: { id: group.id },
            create: { id: group.id, ...data },
            update: data,
          });
          common.properties = jsonValue({
            ...split.properties,
            courseGrouping: group,
          });
        }
        const data = {
          ...common,
          ...courseAttributes(props),
          sourceKind: kind.sourceKind,
          groupId: group?.id ?? null,
          sectionOrder: group?.order ?? null,
          difficulty: split.fields.difficulty,
          angleAvg: split.fields.angleAvg,
          angleMax: split.fields.angleMax,
        };
        await tx.mapCourse.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        });
      } else {
        const data = {
          ...common,
          ...liftAttributes(props),
          type: split.fields.type,
          capacity: split.fields.capacity,
        };
        await tx.mapLift.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        });
      }
    }
    const where = {
      documentKey: kind.primaryKey,
      id: { notIn: [...ids] },
      ...(kind.derived ? {} : { archivedAt: null }),
    };
    const data = kind.derived
      ? {
          derivedIndex: null,
          derivedGeometry: Prisma.DbNull,
          elevationReady: false,
          horizontalDistance: null,
          slopeDistance: null,
          elevationDifference: null,
          calculatedAverageSlope: null,
          calculatedMaxSlope: null,
        }
      : { archivedAt: new Date() };
    if (kind.kind === "course") await tx.mapCourse.updateMany({ where, data });
    else await tx.mapLift.updateMany({ where, data });
  }
  const state = {
    metadata: jsonValue(metadata),
    featureCount,
    mediaType: document.mediaType,
    relational: true,
    hash: document.hash,
    version: document.version,
  };
  await tx.mapDocumentState.upsert({
    where: { key: document.key },
    create: { key: document.key, ...state },
    update: state,
  });
  const rendered = await readCanonicalMapDocument(tx, document.key);
  if (!rendered) throw new Error("Canonical document was not created");
  await tx.mapDocumentState.update({
    where: { key: document.key },
    data: { hash: rendered.hash },
  });
  return rendered;
}

export async function readMapOrDataDocument(tx: Tx, key: string) {
  if (mapDocumentKind(key)) {
    const canonical = await readCanonicalMapDocument(tx, key);
    if (canonical) return canonical;
  }
  return tx.dataDocument.findUnique({ where: { key } });
}

/** Shared columns can change several virtual documents in a single edit. */
export async function refreshCanonicalDocumentStates(
  tx: Tx,
  resortIds: readonly string[],
  writtenKeys: ReadonlySet<string>,
) {
  const documents = new Map<string, MapSourceDocument>();
  if (!resortIds.length) return documents;
  const states = await tx.mapDocumentState.findMany({
    where: {
      relational: true,
      OR: resortIds.flatMap(id => [
        { key: { endsWith: `/${id}.geojson` } },
        { key: { endsWith: `/${id}.json` } },
      ]),
    },
    select: { key: true, hash: true },
  });
  for (const state of states) {
    const rendered = await readCanonicalMapDocument(tx, state.key);
    if (!rendered) continue;
    if (state.hash !== rendered.hash) {
      const indirect = !writtenKeys.has(state.key);
      await tx.mapDocumentState.update({
        where: { key: state.key },
        data: {
          hash: rendered.hash,
          ...(indirect ? { version: { increment: 1 } } : {}),
        },
      });
      if (indirect) rendered.version++;
    }
    documents.set(state.key, rendered);
  }
  return documents;
}
