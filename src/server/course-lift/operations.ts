import type { Prisma } from "@prisma/client";
import { summarizeCourseStatusForList } from "@/features/home/utils/operatingCounts";
import { summarizeMapCourseStatuses } from "@/features/resort-detail/utils/courseStatusSummary";
import {
  courseGroupingRoute,
  readCourseGrouping,
} from "@/shared/course-lift/identity";
import { record } from "./canonicalCodec";
import { canonicalMapsEnabled } from "./canonicalDocuments";
import {
  evaluateOperationCoverage,
  type OperationListingPolicy,
} from "./operationCoverage";
import { writeMapOperations, writeOperationSummaries } from "./operationWrites";

type Tx = Prisma.TransactionClient;
export const OPERATION_SUMMARY_VERSION = 6;
export type OperationEntity = {
  id: string;
  name: string | null;
  groupId?: string | null;
  groupKind?: "continuous" | "routes";
  routeKey?: string;
  recommendationGroupingInvalid?: boolean;
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
  if (!entities.length) {
    return {
      total: fallback > 0 ? fallback : null,
      active: null,
      source: "basic",
    };
  }
  const mapped = entities.filter(row =>
    row.crawledNames.some(name => name.trim() !== ""),
  );
  // 一部だけ対応済みなら対応済みだけを分母にする。対応表が無い地図は
  // 地図の全件を分母にして「不明/N」と出す。
  const counted = mapped.length ? mapped : entities;
  const hasStatusSource = mapped.some(row => row.hasStatusSource);
  if (kind === "course") {
    const summary = summarizeMapCourseStatuses(
      counted.map(row => ({
        ...row,
        groupId: row.groupId ?? row.id,
      })),
    );
    const count = summarizeCourseStatusForList({
      ...summary,
      observedAt: null,
      sourceUrls: [],
      updates: [],
    });
    return {
      total: count?.total ?? null,
      active: mapped.length ? (count?.active ?? null) : null,
      source: hasStatusSource ? "mapping" : "map",
    };
  }
  const groups = new Map<string, Array<string | null>>();
  for (const row of counted) {
    const key = row.id;
    const statuses = groups.get(key) ?? [];
    statuses.push(row.status);
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
      mapped.length && !states.includes(null)
        ? states.filter(Boolean).length
        : null,
    source: hasStatusSource ? "mapping" : "map",
  };
}

/** 地図の各線へ、現在値の営業状態を写す。現在値がない種類は「不明」にする。 */
export async function refreshMapOperations(
  tx: Tx,
  changedIds: readonly string[],
  diagnostic?: {
    runId: string;
    resortId?: string;
    adoptedKinds: Set<string>;
    listingPolicies?: Partial<
      Record<"COURSES" | "LIFTS", OperationListingPolicy>
    >;
  },
) {
  if (!changedIds.length || !(await canonicalMapsEnabled(tx))) return;
  let warningCount = 0;
  const warningKinds = new Set<"COURSES" | "LIFTS">();
  const related = await tx.skiResort.findMany({
    where: {
      OR: [
        { id: { in: [...changedIds] } },
        { sourceResortIds: { hasSome: [...changedIds] } },
        { mergedIntoId: { in: [...changedIds] } },
      ],
    },
    select: { id: true },
  });
  const targets = new Set([...changedIds, ...related.map(row => row.id)]);
  const diagnostics: Prisma.CrawlLatestIssueCreateManyInput[] = [];
  const revisions = diagnostic
    ? await tx.mapDocumentState.findMany({
        where: {
          key: {
            in: [...targets].map(
              id => `resorts-temporary/latest_status_mapping/${id}.json`,
            ),
          },
        },
        select: { key: true, hash: true, version: true },
      })
    : [];
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
      const rows =
        kind === "course"
          ? await tx.mapCourse.findMany({
              where: {
                resortId: id,
                archivedAt: null,
                geometryType: "LineString",
              },
              select: { id: true, crawledNames: true, mappingAssigned: true },
            })
          : await tx.mapLift.findMany({
              where: {
                resortId: id,
                archivedAt: null,
                geometryType: "LineString",
              },
              select: { id: true, crawledNames: true, mappingAssigned: true },
            });
      const policy =
        !diagnostic?.resortId || diagnostic.resortId === id
          ? diagnostic?.listingPolicies?.[category]
          : undefined;
      const coverage = evaluateOperationCoverage(rows, snapshot?.data, policy);
      if (
        diagnostic?.adoptedKinds.has(category) &&
        snapshot &&
        snapshot.runId === diagnostic.runId &&
        snapshot.state !== "NOT_SUPPORTED" &&
        !(snapshot.state === "EMPTY" && snapshot.sourceUrls.length === 0)
      ) {
        const mappingRevision = revisions.find(
          row =>
            row.key === `resorts-temporary/latest_status_mapping/${id}.json`,
        );
        for (const reason of [
          "missing",
          "ambiguous",
          "status-missing",
          "status-invalid",
        ] as const) {
          const gaps = coverage.gaps.filter(gap => gap.reason === reason);
          if (!gaps.length) continue;
          warningCount += gaps.length;
          warningKinds.add(category);
          const codes = {
            missing: "MAPPING.OPERATION_MISSING",
            ambiguous: "MAPPING.AMBIGUOUS_OPERATION",
            "status-missing": "MAPPING.OPERATION_STATUS_MISSING",
            "status-invalid": "MAPPING.OPERATION_STATUS_INVALID",
          };
          diagnostics.push({
            runId: diagnostic.runId,
            categoryKind: category,
            severity: "WARNING",
            code: codes[reason],
            message: `対応表の営業状況を確定できません: ${id} / ${category} / ${reason} (${gaps.length}参照)`,
            occurrences: gaps.length,
            blocksPromotion: false,
            details: {
              resortId: id,
              snapshotId: snapshot.id,
              mappingHash: mappingRevision?.hash ?? null,
              mappingVersion: mappingRevision?.version ?? null,
              gaps,
              unassigned: coverage.unassigned,
              excluded: coverage.excluded,
            },
          });
        }
      }
      await writeMapOperations(
        tx,
        kind,
        coverage.resolved.map(row => {
          const { item: match, status } = row.resolution;
          return {
            id: row.id,
            status,
            statusName: typeof match?.name === "string" ? match.name : null,
            latestNote: typeof match?.note === "string" ? match.note : null,
            officialUpdatedAt:
              typeof match?.update === "string" ? match.update : null,
            statusObservedAt: snapshot?.run.observedAt ?? null,
            // 不明も今回評価した結果。前回の値との混在を識別子で防ぐ。
            statusSnapshotId: snapshot?.id ?? null,
            statusSourceUrls: snapshot?.sourceUrls ?? [],
            hasStatusSource: Boolean(snapshot?.sourceUrls.length),
          };
        }),
      );
    }
  }
  if (diagnostics.length)
    await tx.crawlLatestIssue.createMany({ data: diagnostics });
  const summaries = await calculateMapOperationSummaries(tx, [...targets]);
  await writeOperationSummaries(tx, summaries);
  return { warningCount, warningKinds: [...warningKinds] };
}

/** 保存済み集計も詳細と同じ地図のコース・現在値から集計する。 */
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
      properties: true,
      elevationReady: true,
      hasStatusSource: true,
      statusSnapshotId: true,
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
      statusSnapshotId: true,
    },
  });
  const currents = await tx.crawlLatestCurrent.findMany({
    where: {
      skiResortId: { in: candidateIds },
      kind: { in: ["COURSES", "LIFTS"] },
    },
    select: { skiResortId: true, kind: true, snapshotId: true },
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
    const projectRows = <
      T extends OperationEntity & {
        resortId: string;
        statusSnapshotId: string | null;
      },
    >(
      rows: T[],
      kind: "COURSES" | "LIFTS",
    ) => {
      const current = currents.find(
        row =>
          row.skiResortId === (rows[0]?.resortId ?? id) && row.kind === kind,
      );
      return rows.map(row => ({
        ...row,
        status:
          current && row.statusSnapshotId === current.snapshotId
            ? row.status
            : null,
        hasStatusSource: Boolean(current) && row.hasStatusSource,
      }));
    };
    const groupedCourseRows = courseRows.map(row => {
      const grouping = readCourseGrouping(
        record(row.properties).courseGrouping,
      );
      return {
        ...row,
        ...(grouping
          ? {
              groupKind: grouping.kind,
              ...(grouping.kind === "routes"
                ? {
                    routeKey: `${grouping.id}:route:${courseGroupingRoute(grouping)}`,
                  }
                : {}),
            }
          : {}),
        recommendationGroupingInvalid:
          record(row.properties).courseGrouping != null && !grouping,
      };
    });
    const course = summarizeOperationEntities(
      projectRows(groupedCourseRows, "COURSES"),
      "course",
      resort.numberOfCourses,
    );
    const lift = summarizeOperationEntities(
      projectRows(liftRows, "LIFTS"),
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
