import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Client } from "pg";

const databaseUrl = process.env.CRAWL_LATEST_TEST_DATABASE_URL;

test("crawl latest eligibility constraint matches current promotion rule", {
  skip: !databaseUrl,
}, async () => {
  const url = new URL(databaseUrl ?? "");
  assert.ok(url.hostname === "127.0.0.1" || url.hostname === "localhost");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query(`
      CREATE TEMP TABLE crawl_latest_category_snapshots (
        "state" text NOT NULL,
        "validationState" text NOT NULL,
        "eligibleForCurrent" boolean NOT NULL,
        CONSTRAINT "crawl_latest_category_eligibility_check" CHECK (
          NOT "eligibleForCurrent"
          OR ("state" = 'SUCCESS' AND "validationState" = 'VALID')
        )
      ) ON COMMIT DROP
    `);

    await client.query("SAVEPOINT old_constraint_check");
    let oldConstraintRejected = false;
    try {
      await client.query(
        `INSERT INTO crawl_latest_category_snapshots
          ("state", "validationState", "eligibleForCurrent")
         VALUES ('EMPTY', 'VALID', true)`,
      );
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "23514"
      ) {
        throw error;
      }
      oldConstraintRejected = true;
    }
    await client.query("ROLLBACK TO SAVEPOINT old_constraint_check");
    await client.query("RELEASE SAVEPOINT old_constraint_check");
    assert.equal(oldConstraintRejected, true);

    const migration = await fs.readFile(
      path.resolve(
        "prisma/migrations/20261031000000_align_crawl_latest_eligibility/migration.sql",
      ),
      "utf8",
    );
    await client.query(migration);

    const states = ["SUCCESS", "EMPTY", "NOT_SUPPORTED", "FAILED"];
    const validations = ["VALID", "WARNING", "INVALID"];
    for (const state of states) {
      for (const validationState of validations) {
        for (const eligibleForCurrent of [false, true]) {
          const savepoint = `case_${states.indexOf(state)}_${validations.indexOf(validationState)}_${Number(eligibleForCurrent)}`;
          await client.query(`SAVEPOINT ${savepoint}`);
          let rejected = false;
          try {
            await client.query(
              `INSERT INTO crawl_latest_category_snapshots
                ("state", "validationState", "eligibleForCurrent")
               VALUES ($1, $2, $3)`,
              [state, validationState, eligibleForCurrent],
            );
          } catch (error) {
            if (
              typeof error !== "object" ||
              error === null ||
              !("code" in error) ||
              error.code !== "23514"
            ) {
              throw error;
            }
            rejected = true;
          }
          if (rejected) {
            await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          }
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
          const expectedAccepted =
            !eligibleForCurrent ||
            (state !== "FAILED" && validationState !== "INVALID");
          assert.equal(
            rejected,
            !expectedAccepted,
            `unexpected eligibility result: ${state}/${validationState}/${eligibleForCurrent}`,
          );
        }
      }
    }
  } finally {
    try {
      if (transactionStarted) await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  }
});
