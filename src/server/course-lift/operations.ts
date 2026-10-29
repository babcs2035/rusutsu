import type { Prisma } from "@prisma/client";
import { combineLatestStatuses } from "@/lib/linkedAreaStatus";
import { normalizeCrawledName } from "@/lib/resortMapMerge";
import { record } from "./canonicalCodec";
import { canonicalMapsEnabled } from "./canonicalDocuments";

type Tx = Prisma.TransactionClient;
export type OperationEntity = {
  id: string;
  name: string | null;
  groupId?: string | null;
  crawledNames: string[];
  status: string | null;
  elevationReady?: boolean;
  hasStatusSource: boolean;
};
const symbol = (value: unknown) => {
  if (typeof value !== "string") return null;
  if (/[○〇◯]/u.test(value)) return "○";
  if (value.includes("△")) return "△";
  if (/[×✕✖]/u.test(value)) return "×";
  return null;
};
export function summarizeOperationEntities(
  entities: OperationEntity[],
  kind: "course" | "lift",
  fallback: number,
) {
  if (
    !entities.length ||
    (kind === "course" && entities.some(row => !row.elevationReady))
  ) {
    return {
      total: fallback > 0 ? fallback : null,
      active: null,
      source: "basic",
    };
  }
  const hasStatusSource = entities.some(row => row.hasStatusSource);
  const selected = hasStatusSource
    ? entities.filter(row => row.crawledNames.length > 0)
    : entities.filter(
        row =>
          kind === "lift" ||
          (row.name?.trim() &&
            !/^(?:無名|名前不明|名称不明)/u.test(row.name.trim())),
      );
  const groups = new Map<string, Array<string | null>>();
  for (const row of selected) {
    const key = kind === "course" ? (row.groupId ?? row.id) : row.id;
    const statuses = groups.get(key) ?? [];
    statuses.push(hasStatusSource ? row.status : null);
    groups.set(key, statuses);
  }
  const states = [...groups.values()].map(statuses =>
    statuses.some(status => symbol(status) === "○" || symbol(status) === "△")
      ? true
      : statuses.every(status => symbol(status) === "×")
        ? false
        : null,
  );
  return {
    total: states.length || null,
    active:
      states.length && !states.includes(null)
        ? states.filter(Boolean).length
        : null,
    source: hasStatusSource ? "mapping" : "map",
  };
}

/** 地図の各線へ、現在値の営業状態を写す。現在値がない種類は「不明」にする。 */
export async function refreshMapOperations(
  tx: Tx,
  changedIds: readonly string[],
  diagnostic?: { runId: string; adoptedKinds: Set<string> },
) {
  if (!changedIds.length || !(await canonicalMapsEnabled(tx))) return;
  let warningCount = 0;
  const resorts = await tx.skiResort.findMany({
    select: {
      id: true,
      nameJa: true,
      mergedIntoId: true,
      linkKind: true,
      sourceResortIds: true,
      numberOfCourses: true,
      numberOfLifts: true,
    },
  });
  const byId = new Map(resorts.map(resort => [resort.id, resort]));
  const changed = new Set(changedIds);
  const targets = new Set(changedIds);
  for (const resort of resorts) {
    if (
      resort.sourceResortIds.some(id => changed.has(id)) ||
      (resort.mergedIntoId && changed.has(resort.mergedIntoId))
    )
      targets.add(resort.id);
  }
  const membersFor = (id: string) => {
    const resort = byId.get(id);
    if (resort?.linkKind !== "LINKED") return [id];
    return resorts
      .filter(member => member.mergedIntoId === id)
      .map(member => member.id);
  };
  const sourceIds = [...new Set([...targets].flatMap(membersFor))];
  const currents = await tx.crawlLatestCurrent.findMany({
    where: {
      skiResortId: { in: sourceIds },
      kind: { in: ["COURSES", "LIFTS"] },
    },
    include: {
      snapshot: { include: { run: { select: { observedAt: true } } } },
    },
  });
  for (const id of targets) {
    const members = membersFor(id);
    for (const [kind, category] of [
      ["course", "COURSES"],
      ["lift", "LIFTS"],
    ] as const) {
      const captures = await Promise.all(
        members.map(async member => {
          const current = currents.find(
            row => row.skiResortId === member && row.kind === category,
          );
          // 現在値がなければ「不明」にする。Git管理の古いファイルでは補わない。
          if (!current) return null;
          const snapshot = current.snapshot;
          const items = Array.isArray(snapshot.data)
            ? snapshot.data.map(item => ({
                ...record(item),
                _snapshotId: snapshot.id,
                _observedAt: snapshot.run.observedAt.toISOString(),
                _sourceUrls: snapshot.sourceUrls,
              }))
            : [];
          return {
            fileName: snapshot.id,
            time: snapshot.run.observedAt.toISOString(),
            sourceUrls: snapshot.sourceUrls,
            items,
          };
        }),
      );
      const combined = combineLatestStatuses(
        captures,
        members.map(member => byId.get(member)?.nameJa ?? member),
      );
      const items = new Map<string, Array<Record<string, unknown>>>();
      for (const item of combined?.items ?? []) {
        if (typeof item.name !== "string") continue;
        const name = normalizeCrawledName(item.name);
        items.set(name, [...(items.get(name) ?? []), item]);
      }
      const rows =
        kind === "course"
          ? await tx.mapCourse.findMany({
              where: {
                resortId: id,
                archivedAt: null,
                geometryType: "LineString",
              },
              select: { id: true, crawledNames: true },
            })
          : await tx.mapLift.findMany({
              where: {
                resortId: id,
                archivedAt: null,
                geometryType: "LineString",
              },
              select: { id: true, crawledNames: true },
            });
      for (const row of rows) {
        const matches = [
          ...new Set(
            row.crawledNames.flatMap(
              name => items.get(normalizeCrawledName(name)) ?? [],
            ),
          ),
        ];
        const match = matches.length === 1 ? matches[0] : null;
        if (
          diagnostic?.adoptedKinds.has(category) &&
          combined &&
          row.crawledNames.length > 0 &&
          matches.length !== 1
        ) {
          warningCount++;
          await tx.crawlLatestIssue.create({
            data: {
              runId: diagnostic.runId,
              categoryKind: category,
              severity: "WARNING",
              code: matches.length
                ? "MAPPING.AMBIGUOUS_OPERATION"
                : "MAPPING.OPERATION_MISSING",
              message: `対応先の営業情報を特定できません: ${id} / ${row.id}`,
              details: {
                resortId: id,
                entityId: row.id,
                crawledNames: row.crawledNames,
              },
            },
          });
        }
        const observedAt = match?._observedAt ?? combined?.time;
        const observedTime =
          typeof observedAt === "string" ? new Date(observedAt) : null;
        const data = {
          status: symbol(match?.status),
          statusName: typeof match?.name === "string" ? match.name : null,
          latestNote: typeof match?.note === "string" ? match.note : null,
          officialUpdatedAt:
            typeof match?.update === "string" ? match.update : null,
          statusObservedAt:
            observedTime && Number.isFinite(observedTime.getTime())
              ? observedTime
              : null,
          statusSnapshotId:
            typeof match?._snapshotId === "string" ? match._snapshotId : null,
          statusSourceUrls:
            match && Array.isArray(match._sourceUrls)
              ? (match._sourceUrls as string[])
              : (combined?.sourceUrls ?? []),
          hasStatusSource: Boolean(combined?.items.length),
        };
        if (kind === "course")
          await tx.mapCourse.update({ where: { id: row.id }, data });
        else await tx.mapLift.update({ where: { id: row.id }, data });
      }
    }
  }
  // Summaries use scalar columns only. They never fetch coordinates or GeoJSON.
  const candidateIds = [
    ...new Set(
      [...targets].flatMap(id => {
        const row = byId.get(id);
        return [
          id,
          ...(row?.sourceResortIds ?? []),
          ...(row?.mergedIntoId ? [row.mergedIntoId] : []),
        ];
      }),
    ),
  ];
  const courses = await tx.mapCourse.findMany({
    where: {
      resortId: { in: candidateIds },
      archivedAt: null,
      geometryType: "LineString",
    },
    select: {
      id: true,
      resortId: true,
      name: true,
      groupId: true,
      crawledNames: true,
      status: true,
      elevationReady: true,
      hasStatusSource: true,
    },
  });
  const lifts = await tx.mapLift.findMany({
    where: {
      resortId: { in: candidateIds },
      archivedAt: null,
      geometryType: "LineString",
    },
    select: {
      id: true,
      resortId: true,
      name: true,
      crawledNames: true,
      status: true,
      hasStatusSource: true,
    },
  });
  for (const id of targets) {
    const resort = byId.get(id);
    if (!resort) continue;
    const candidates = [
      resort.mergedIntoId,
      id,
      ...resort.sourceResortIds,
    ].filter((candidate): candidate is string => Boolean(candidate));
    const courseRows =
      candidates
        .map(candidate => courses.filter(row => row.resortId === candidate))
        .find(rows => rows.length) ?? [];
    const liftRows =
      candidates
        .map(candidate => lifts.filter(row => row.resortId === candidate))
        .find(rows => rows.length) ?? [];
    const course = summarizeOperationEntities(
      courseRows,
      "course",
      resort.numberOfCourses,
    );
    const lift = summarizeOperationEntities(
      liftRows,
      "lift",
      resort.numberOfLifts,
    );
    const data = {
      hasMap: Boolean(courseRows.length || liftRows.length),
      courseTotal: course.total,
      courseActive: course.active,
      liftTotal: lift.total,
      liftActive: lift.active,
      courseCountSource: course.source,
      liftCountSource: lift.source,
      calculationVersion: 1,
    };
    await tx.skiResortOperationSummary.upsert({
      where: { skiResortId: id },
      create: { skiResortId: id, ...data },
      update: data,
    });
  }
  return { warningCount };
}
