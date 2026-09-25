import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { readCourseGrouping } from "@/shared/course-lift/identity";
import {
  contentHash,
  derivedKey,
  type MapSourceDocument,
  primaryMapKey,
  readCollection,
} from "./migrationPlan";

const json = (v: unknown) =>
  v === null || v === undefined
    ? Prisma.JsonNull
    : (v as Prisma.InputJsonValue);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
type Tx = Prisma.TransactionClient;

/** Atomic projection: keeps individual entity IDs, soft-archives removed lines. */
export async function syncMapEntities(tx: Tx, keys: readonly string[]) {
  const primaryKeys = new Set(
    keys.flatMap(key =>
      primaryMapKey(key)
        ? [key]
        : /\/(?:slope_10m(?:_osm)?|lift_20m)\//u.test(key)
          ? [
              key
                .replace("slope_10m_osm/", "slope_before_osm/")
                .replace("slope_10m/", "slope_before/")
                .replace("lift_20m/", "lift_before/"),
            ]
          : [],
    ),
  );
  const documents = await tx.dataDocument.findMany({
    where: {
      key: { in: [...primaryKeys].flatMap(key => [key, derivedKey(key)]) },
    },
  });
  const byKey = new Map(documents.map(d => [d.key, d]));
  const activeIds = new Set<string>();
  for (const key of primaryKeys) {
    const doc = byKey.get(key);
    if (!doc) continue;
    for (const f of readCollection(doc.content).features) {
      const id = f.properties?.entityId;
      if (typeof id !== "string" || !id)
        throw new Error(`Map entity ID required: ${key}`);
      if (activeIds.has(id)) throw new Error(`Duplicate entity ID: ${id}`);
      activeIds.add(id);
    }
  }
  for (const key of primaryKeys) {
    const doc = byKey.get(key);
    if (!doc) continue;
    const source = primaryMapKey(key);
    if (!source) throw new Error(`Invalid primary key: ${key}`);
    const collection = readCollection(doc.content);
    const derived = byKey.get(derivedKey(key));
    const dfs = derived ? readCollection(derived.content).features : [];
    const ids: string[] = [];
    const groupOrders = new Set<string>();
    const groupDefinitions = new Map<string, string>();
    for (const [index, f] of collection.features.entries()) {
      const props = f.properties ?? {};
      const id = String(props.entityId);
      ids.push(id);
      const matches = dfs.filter(df => df.properties?.entityId === id);
      const common = {
        resortId: source.resortId,
        documentKey: key,
        sourceIndex: index,
        name: str(props.name),
        distance: num(props.distance),
        properties: json(props),
        geometry: json(f.geometry),
        feature: json(f),
        derivedFeature: matches.length === 1 ? json(matches[0]) : Prisma.DbNull,
        archivedAt: null,
      };
      if (source.kind === "course") {
        const group = readCourseGrouping(props.courseGrouping);
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
          const orderKey = `${group.id}:${group.order}`;
          if (groupOrders.has(orderKey))
            throw new Error(`Duplicate section order: ${orderKey}`);
          groupOrders.add(orderKey);
          const existing = await tx.mapCourseGroup.findUnique({
            where: { id: group.id },
          });
          if (
            existing &&
            (existing.resortId !== source.resortId ||
              existing.sourceKind !== source.sourceKind)
          )
            throw new Error("Group belongs to another resort/source");
          const groupData = {
            resortId: source.resortId,
            sourceKind: source.sourceKind,
            name: group.name,
            kind: group.kind,
          };
          await tx.mapCourseGroup.upsert({
            where: { id: group.id },
            create: { id: group.id, ...groupData },
            update: groupData,
          });
        }
        const data = {
          ...common,
          sourceKind: source.sourceKind,
          groupId: group?.id ?? null,
          sectionOrder: group?.order ?? null,
          difficulty: str(props.level),
          angleAvg: num(props.avg),
          angleMax: num(props.max),
        };
        await assertMovable(tx, "course", id, key, primaryKeys);
        await tx.mapCourse.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        });
      } else {
        await assertMovable(tx, "lift", id, key, primaryKeys);
        const capacity = num(props.capacity);
        const data = {
          ...common,
          type: str(props.type),
          capacity:
            capacity !== null &&
            Number.isSafeInteger(capacity) &&
            Math.abs(capacity) <= 2147483647
              ? capacity
              : null,
        };
        await tx.mapLift.upsert({
          where: { id },
          create: { id, ...data },
          update: data,
        });
      }
    }
    const where = {
      documentKey: key,
      archivedAt: null,
      id: { notIn: [...activeIds] },
    };
    if (source.kind === "course")
      await tx.mapCourse.updateMany({
        where,
        data: { archivedAt: new Date() },
      });
    else
      await tx.mapLift.updateMany({ where, data: { archivedAt: new Date() } });
    await tx.mapDocumentState.upsert({
      where: { key },
      create: { key, hash: doc.hash, featureCount: ids.length },
      update: { hash: doc.hash, featureCount: ids.length },
    });
  }
}
async function assertMovable(
  tx: Tx,
  kind: "course" | "lift",
  id: string,
  key: string,
  keys: Set<string>,
) {
  const old =
    kind === "course"
      ? await tx.mapCourse.findUnique({
          where: { id },
          select: { documentKey: true },
        })
      : await tx.mapLift.findUnique({
          where: { id },
          select: { documentKey: true },
        });
  if (old && old.documentKey !== key && !keys.has(old.documentKey))
    throw new Error(
      `Entity ${id} already belongs to another document; move both documents atomically`,
    );
}

/** Read via relational rows, retaining exact cached JSON bytes for optimistic hashes. */
export async function verifyRelationalDocument(
  tx: Tx,
  document: MapSourceDocument,
) {
  const source = primaryMapKey(document.key);
  if (!source) return document;
  const state = await tx.mapDocumentState.findUnique({
    where: { key: document.key },
  });
  if (!state) return document;
  if (state.hash !== document.hash)
    throw new Error(`Relational document out of sync: ${document.key}`);
  const where = { documentKey: document.key, archivedAt: null };
  const rows =
    source.kind === "course"
      ? await tx.mapCourse.findMany({
          where,
          orderBy: { sourceIndex: "asc" },
          select: { feature: true },
        })
      : await tx.mapLift.findMany({
          where,
          orderBy: { sourceIndex: "asc" },
          select: { feature: true },
        });
  const collection = readCollection(document.content);
  if (
    rows.length !== state.featureCount ||
    !isDeepStrictEqual(
      collection.features,
      rows.map(r => r.feature),
    ) ||
    contentHash(document.content) !== document.hash
  )
    throw new Error(`Relational verification failed: ${document.key}`);
  return document;
}
