// Prisma と PostgreSQL の transaction 競合判定を検査する．
import assert from "node:assert/strict";
import { test } from "node:test";
import { isRetryableSummaryTransactionError } from "./transactionConflict";

test("recognizes Prisma transaction conflicts", () => {
  assert.equal(isRetryableSummaryTransactionError({ code: "P2034" }), true);
});

test("recognizes PostgreSQL adapter serialization errors from raw SQL", () => {
  assert.equal(
    isRetryableSummaryTransactionError({
      code: "P2010",
      meta: {
        driverAdapterError: {
          originalCode: "40001",
          kind: "postgres",
          code: "40001",
        },
      },
    }),
    true,
  );
  assert.equal(
    isRetryableSummaryTransactionError({
      code: "P2010",
      meta: { code: "40P01" },
    }),
    true,
  );
});

test("does not retry unrelated database errors or message lookalikes", () => {
  assert.equal(
    isRetryableSummaryTransactionError({
      code: "P2010",
      meta: { driverAdapterError: { originalCode: "23505" } },
      message: "40001",
    }),
    false,
  );
  assert.equal(isRetryableSummaryTransactionError({ code: "P2002" }), false);
  assert.equal(isRetryableSummaryTransactionError(new Error("40001")), false);
});
