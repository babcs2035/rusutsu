import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import {
  type MapOperationWrite,
  type OperationSummaryWrite,
  writeMapOperations,
  writeOperationSummaries,
} from "./operationWrites";

type CapturedQuery = { sql: string; values: unknown[] };

const operation = (
  overrides: Partial<MapOperationWrite> = {},
): MapOperationWrite => ({
  id: "operation-1",
  status: "○",
  statusName: "Open",
  latestNote: null,
  officialUpdatedAt: "2026-11-03 09:00",
  statusObservedAt: new Date("2026-11-03T00:00:00.000Z"),
  statusSnapshotId: "snapshot-1",
  statusSourceUrls: ["https://example.com/status"],
  hasStatusSource: true,
  ...overrides,
});

const operationSummary = (
  overrides: Partial<OperationSummaryWrite> = {},
): OperationSummaryWrite => ({
  skiResortId: "resort-1",
  hasMap: true,
  courseTotal: 12,
  courseActive: 8,
  liftTotal: 6,
  liftActive: 4,
  courseCountSource: "server-mapping",
  liftCountSource: "legacy-count",
  calculationVersion: 4,
  ...overrides,
});

const fakeTransaction = () => {
  const calls: CapturedQuery[] = [];
  const tx = {
    $executeRaw: async (query: Prisma.Sql) => {
      calls.push({ sql: query.sql, values: query.values });
      return 1;
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
};

test("batches parameterized operation writes and safely handles empty URL arrays", async () => {
  const { tx, calls } = fakeTransaction();
  const quotedStatus = "Open'); DROP TABLE map_courses; --";
  const quotedUrl = "https://example.com/status?value=' OR 1=1 --";

  await writeMapOperations(tx, "course", [
    operation({
      id: "course-1",
      statusName: quotedStatus,
      latestNote: "Patrol's note",
      statusSourceUrls: [quotedUrl],
    }),
    operation({
      id: "course-2",
      status: null,
      statusName: null,
      statusSourceUrls: [],
      hasStatusSource: false,
    }),
  ]);

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE "map_courses"/);
  assert.match(calls[0].sql, /FROM \(VALUES/);
  assert.match(calls[0].sql, /ARRAY\[\]::text\[\]/);
  assert.equal(calls[0].sql.includes(quotedStatus), false);
  assert.equal(calls[0].sql.includes("Patrol's note"), false);
  assert.equal(calls[0].sql.includes(quotedUrl), false);
  assert.ok(calls[0].values.includes(quotedStatus));
  assert.ok(calls[0].values.includes("Patrol's note"));
  assert.ok(calls[0].values.includes(quotedUrl));
  assert.ok(calls[0].values.includes("course-1"));
  assert.ok(calls[0].values.includes("course-2"));
});

test("uses one UPDATE for each non-empty kind and skips empty inputs", async () => {
  const { tx, calls } = fakeTransaction();

  await writeMapOperations(tx, "course", []);
  await writeMapOperations(tx, "lift", []);
  await writeMapOperations(tx, "course", [operation({ id: "course-1" })]);
  await writeMapOperations(tx, "lift", [operation({ id: "lift-1" })]);

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /UPDATE "map_courses"/);
  assert.match(calls[1].sql, /UPDATE "map_lifts"/);
  assert.equal(calls[0].values.includes("course-1"), true);
  assert.equal(calls[1].values.includes("lift-1"), true);
});

test("batches legacy operation summaries and skips empty input", async () => {
  const { tx, calls } = fakeTransaction();
  const quotedResortId = "resort'); DELETE FROM ski_resorts; --";

  await writeOperationSummaries(tx, []);
  await writeOperationSummaries(tx, [
    operationSummary({ skiResortId: quotedResortId }),
    operationSummary({
      skiResortId: "resort-2",
      hasMap: false,
      courseTotal: null,
      courseActive: null,
      liftTotal: null,
      liftActive: null,
      courseCountSource: "none",
      liftCountSource: "none",
      calculationVersion: 0,
    }),
  ]);

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO "ski_resort_operation_summaries"/);
  assert.match(calls[0].sql, /ON CONFLICT \("skiResortId"\)/);
  assert.equal(calls[0].sql.includes(quotedResortId), false);
  assert.ok(calls[0].values.includes(quotedResortId));
  assert.ok(calls[0].values.includes("server-mapping"));
  assert.ok(calls[0].values.includes("legacy-count"));
  assert.ok(calls[0].values.includes(12));
  assert.ok(calls[0].values.includes(8));
  assert.ok(calls[0].values.includes("resort-2"));
  assert.ok(calls[0].values.includes(null));
  assert.ok(calls[0].values.includes("none"));
  assert.ok(calls[0].values.includes(0));
});
