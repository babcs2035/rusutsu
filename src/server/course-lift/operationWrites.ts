import { Prisma } from "@prisma/client";

export type MapOperationWrite = {
  id: string;
  status: string | null;
  statusName: string | null;
  latestNote: string | null;
  officialUpdatedAt: string | null;
  statusObservedAt: Date | null;
  statusSnapshotId: string | null;
  statusSourceUrls: string[];
  hasStatusSource: boolean;
};

/** 項目数に比例するDB往復を避け、カテゴリごとにまとめて反映する。 */
export async function writeMapOperations(
  tx: Prisma.TransactionClient,
  kind: "course" | "lift",
  rows: MapOperationWrite[],
) {
  if (!rows.length) return;
  const table =
    kind === "course" ? Prisma.sql`"map_courses"` : Prisma.sql`"map_lifts"`;
  const values = rows.map(
    row => Prisma.sql`(
    ${row.id}::text, ${row.status}::text, ${row.statusName}::text,
    ${row.latestNote}::text, ${row.officialUpdatedAt}::text,
    ${row.statusObservedAt}::timestamptz, ${row.statusSnapshotId}::text,
    ${row.statusSourceUrls.length ? Prisma.sql`ARRAY[${Prisma.join(row.statusSourceUrls)}]::text[]` : Prisma.sql`ARRAY[]::text[]`}, ${row.hasStatusSource}::boolean
  )`,
  );
  await tx.$executeRaw(Prisma.sql`
    UPDATE ${table} AS target SET
      "status" = incoming.status, "statusName" = incoming.name,
      "latestNote" = incoming.note, "officialUpdatedAt" = incoming.published,
      "statusObservedAt" = incoming.observed, "statusSnapshotId" = incoming.snapshot,
      "statusSourceUrls" = incoming.urls, "hasStatusSource" = incoming.has_source,
      "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(values)})
      AS incoming(id, status, name, note, published, observed, snapshot, urls, has_source)
    WHERE target.id = incoming.id
  `);
}

export type OperationSummaryWrite = {
  skiResortId: string;
  hasMap: boolean;
  courseTotal: number | null;
  courseActive: number | null;
  liftTotal: number | null;
  liftActive: number | null;
  courseCountSource: string;
  liftCountSource: string;
  calculationVersion: number;
};

export async function writeOperationSummaries(
  tx: Prisma.TransactionClient,
  rows: OperationSummaryWrite[],
) {
  if (!rows.length) return;
  const values = rows.map(
    row => Prisma.sql`(
    ${row.skiResortId}::text, ${row.hasMap}::boolean,
    ${row.courseTotal}::integer, ${row.courseActive}::integer,
    ${row.liftTotal}::integer, ${row.liftActive}::integer,
    ${row.courseCountSource}::text, ${row.liftCountSource}::text,
    ${row.calculationVersion}::integer, NOW()
  )`,
  );
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "ski_resort_operation_summaries"
      ("skiResortId", "hasMap", "courseTotal", "courseActive", "liftTotal", "liftActive",
       "courseCountSource", "liftCountSource", "calculationVersion", "updatedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("skiResortId") DO UPDATE SET
      "hasMap" = EXCLUDED."hasMap", "courseTotal" = EXCLUDED."courseTotal",
      "courseActive" = EXCLUDED."courseActive", "liftTotal" = EXCLUDED."liftTotal",
      "liftActive" = EXCLUDED."liftActive", "courseCountSource" = EXCLUDED."courseCountSource",
      "liftCountSource" = EXCLUDED."liftCountSource", "calculationVersion" = EXCLUDED."calculationVersion",
      "updatedAt" = EXCLUDED."updatedAt"
  `);
}
