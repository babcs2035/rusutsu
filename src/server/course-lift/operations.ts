import type { Prisma } from "@prisma/client";
import { summarizeCourseStatusForList } from "@/features/home/utils/operatingCounts";
import {
  type CourseStatusSummary,
  createCourseStatusSummary,
} from "@/lib/courseStatusSummary";
import { normalizeCrawledName } from "@/lib/resortMapMerge";
import { record } from "./canonicalCodec";
import { canonicalMapsEnabled } from "./canonicalDocuments";

type Tx = Prisma.TransactionClient;
export const OPERATION_SUMMARY_VERSION = 2;
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
  courseStatus?: CourseStatusSummary | null,
) {
  if (kind === "course" && courseStatus?.sourceUrls.some(url => url.trim())) {
    const count = summarizeCourseStatusForList(courseStatus);
    return {
      total: count?.total ?? null,
      active: count?.active ?? null,
      source: "mapping",
    };
  }
  if (!entities.length) {
    return {
      total: fallback > 0 ? fallback : null,
      active: null,
      source: "basic",
    };
  }
  // 詳細の「未取得」と同じく、標高・名前・対応付けに関係なく地図のグループを数える。
  if (kind === "course") {
    return {
      total: new Set(entities.map(row => row.groupId ?? row.id)).size,
      active: null,
      source: "map",
    };
  }
  const hasStatusSource = entities.some(row => row.hasStatusSource);
  const selected = hasStatusSource
    ? entities.filter(row => row.crawledNames.length > 0)
    : entities;
  const groups = new Map<string, Array<string | null>>();
  for (const row of selected) {
    const key = row.id;
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
      sourceResortIds: true,
      numberOfCourses: true,
      numberOfLifts: true,
    },
  });
  const changed = new Set(changedIds);
  const targets = new Set(changedIds);
  for (const resort of resorts) {
    if (
      resort.sourceResortIds.some(id => changed.has(id)) ||
      (resort.mergedIntoId && changed.has(resort.mergedIntoId))
    )
      targets.add(resort.id);
  }
  const currents = await tx.crawlLatestCurrent.findMany({
    where: {
      skiResortId: { in: [...targets] },
      kind: { in: ["COURSES", "LIFTS"] },
    },
    include: {
      snapshot: { include: { run: { select: { observedAt: true } } } },
    },
  });
  for (const id of targets) {
    for (const [kind, category] of [
      ["course", "COURSES"],
      ["lift", "LIFTS"],
    ] as const) {
      // 現在値がなければ「不明」にする。Git管理の古いファイルでは補わない。
      const snapshot = currents.find(
        row => row.skiResortId === id && row.kind === category,
      )?.snapshot;
      const captured: Array<Record<string, unknown>> = snapshot
        ? (Array.isArray(snapshot.data) ? snapshot.data : []).map(item => ({
            ...record(item),
            _snapshotId: snapshot.id,
            _observedAt: snapshot.run.observedAt.toISOString(),
            _sourceUrls: snapshot.sourceUrls,
          }))
        : [];
      const items = new Map<string, Array<Record<string, unknown>>>();
      for (const item of captured) {
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
          snapshot &&
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
        const observedAt =
          match?._observedAt ?? snapshot?.run.observedAt.toISOString();
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
              : (snapshot?.sourceUrls ?? []),
          hasStatusSource: captured.length > 0,
        };
        if (kind === "course")
          await tx.mapCourse.update({ where: { id: row.id }, data });
        else await tx.mapLift.update({ where: { id: row.id }, data });
      }
    }
  }
  const summaries = await calculateMapOperationSummaries(tx, [...targets]);
  for (const { skiResortId, ...data } of summaries) {
    await tx.skiResortOperationSummary.upsert({
      where: { skiResortId },
      create: { skiResortId, ...data },
      update: data,
    });
  }
  return { warningCount };
}

/** 保存済み集計の更新と旧版の読み取りに、詳細と同じ公式項目の集計を使う。 */
export async function calculateMapOperationSummaries(
  tx: Tx,
  resortIds: readonly string[],
) {
  if (!resortIds.length) return [];
  const resorts = await tx.skiResort.findMany({
    where: { id: { in: [...resortIds] } },
    select: {
      id: true,
      mergedIntoId: true,
      sourceResortIds: true,
      numberOfCourses: true,
      numberOfLifts: true,
    },
  });
  // 座標やGeoJSONは取得せず、集計に必要な属性と採用済み営業情報だけを読む。
  const candidateIds = [
    ...new Set(
      resorts.flatMap(row => {
        return [
          row.id,
          ...row.sourceResortIds,
          ...(row.mergedIntoId ? [row.mergedIntoId] : []),
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
      statusName: true,
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
  const currents = await tx.crawlLatestCurrent.findMany({
    where: { skiResortId: { in: candidateIds }, kind: "COURSES" },
    include: { snapshot: true },
  });
  return resorts.map(resort => {
    const id = resort.id;
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
    // 詳細が表示する地図の営業情報を使う。複数の線が同じ公式項目を参照しても加算しない。
    const snapshot = currents.find(
      row => row.skiResortId === (courseRows[0]?.resortId ?? id),
    )?.snapshot;
    const courseStatus = createCourseStatusSummary(
      snapshot
        ? {
            fileName: snapshot.id,
            time: null,
            items: Array.isArray(snapshot.data)
              ? snapshot.data.map(record)
              : [],
            sourceUrls: snapshot.sourceUrls,
          }
        : null,
      courseRows.map(row => row.statusName),
      courseRows.some(row => row.crawledNames.length > 0),
    );
    const course = summarizeOperationEntities(
      courseRows,
      "course",
      resort.numberOfCourses,
      courseStatus,
    );
    const lift = summarizeOperationEntities(
      liftRows,
      "lift",
      resort.numberOfLifts,
    );
    return {
      skiResortId: id,
      hasMap: Boolean(courseRows.length || liftRows.length),
      courseTotal: course.total,
      courseActive: course.active,
      liftTotal: lift.total,
      liftActive: lift.active,
      courseCountSource: course.source,
      liftCountSource: lift.source,
      calculationVersion: OPERATION_SUMMARY_VERSION,
    };
  });
}
