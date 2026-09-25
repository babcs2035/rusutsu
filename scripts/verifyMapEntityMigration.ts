/** Runs ONLY against a dedicated disposable local PostgreSQL. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { Client } from "pg";
import {
  contentHash,
  makeMapMigrationPlan,
} from "../src/server/course-lift/migrationPlan";
import {
  syncMapEntities,
  verifyRelationalDocument,
} from "../src/server/course-lift/repository";

async function main() {
  const connectionString = process.env.MAP_MIGRATION_TEST_URL;
  if (!connectionString) throw new Error("MAP_MIGRATION_TEST_URL required");
  const url = new URL(connectionString);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/map_test"
  )
    throw new Error("Only disposable localhost/map_test allowed");
  process.env.DATABASE_URL = connectionString;
  const logRoot =
    "src/private/data/resorts-temporary/tmp/map-entities-migration";
  const client = new Client({ connectionString });
  await client.connect();
  const existing = await client.query(
    "SELECT to_regclass('data_documents') AS existing",
  );
  const manifest = JSON.parse(
    await fs.readFile(
      "src/private/data/backups/course-lift/2026-09-25/manifest.json",
      "utf8",
    ),
  );
  const report = `${logRoot}/db-report.json`;
  let dry: { courses: number; lifts: number; inputHash: string };
  if (process.argv.includes("--verify-existing")) {
    assert.equal(existing.rows[0].existing, "data_documents");
    await client.end();
    dry = JSON.parse(await fs.readFile(report, "utf8"));
  } else {
    assert.equal(
      existing.rows[0].existing,
      null,
      "Test database must be empty",
    );
    await client.query(`CREATE TABLE data_documents (key VARCHAR(1024) PRIMARY KEY, content TEXT NOT NULL, "mediaType" VARCHAR(255) NOT NULL, hash CHAR(64) NOT NULL, version INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE canonical_data_migrations (key VARCHAR(200) PRIMARY KEY,"sourceHash" CHAR(64) NOT NULL, details JSONB NOT NULL,"completedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
    await client.query(
      await fs.readFile(
        "prisma/migrations/20260925120000_add_map_entities/migration.sql",
        "utf8",
      ),
    );
    for (const d of manifest.documents) {
      const content = await fs.readFile(`src/private/data/${d.key}`, "utf8");
      assert.equal(contentHash(content), d.hash);
      await client.query(
        'INSERT INTO data_documents (key,content,"mediaType",hash,version) VALUES ($1,$2,$3,$4,$5)',
        [
          d.key,
          content,
          d.key.endsWith(".geojson")
            ? "application/geo+json"
            : "application/json",
          d.hash,
          d.version,
        ],
      );
    }
    await client.end();
    const run = (args: string[]) => {
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/migrateMapEntities.ts", ...args],
        { env: process.env, encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return result.stdout;
    };
    console.log(run(["--dry-run", "--report", report]));
    dry = JSON.parse(await fs.readFile(report, "utf8"));
    console.log(
      run(["--apply", "--expected-hash", dry.inputHash, "--report", report]),
    );
  }
  const { prisma, disconnectPrisma } = await import("../src/lib/prisma");
  try {
    assert.equal(
      await prisma.mapCourse.count({ where: { archivedAt: null } }),
      dry.courses,
    );
    assert.equal(
      await prisma.mapLift.count({ where: { archivedAt: null } }),
      dry.lifts,
    );
    assert.equal(
      await prisma.mapDocumentBackup.count(),
      manifest.documents.length,
    );
    const all = await prisma.dataDocument.findMany();
    assert.equal(
      makeMapMigrationPlan(all).changes.length,
      0,
      "Rerun must be idempotent",
    );
    for (const d of manifest.documents) {
      const backup = await prisma.mapDocumentBackup.findUniqueOrThrow({
        where: { key_hash: { key: d.key, hash: d.hash } },
      });
      assert.equal(contentHash(backup.content), d.hash);
    }
    const key = "resorts-temporary/slope_before/appi-kogen.geojson";
    const original = await prisma.dataDocument.findUniqueOrThrow({
      where: { key },
    });
    const parsed = JSON.parse(original.content);
    const first = parsed.features[0],
      second = parsed.features[1];
    const a = first.properties.entityId,
      b = second.properties.entityId;
    const group = {
      id: "integration-test-group",
      name: "同名テスト",
      kind: "continuous",
    };
    first.properties.name = "同名テスト";
    second.properties.name = "同名テスト";
    first.properties.courseGrouping = { ...group, order: 2 };
    second.properties.courseGrouping = { ...group, order: 1 };
    const content = JSON.stringify(parsed),
      hash = contentHash(content);
    await prisma.$transaction(
      async tx => {
        await tx.dataDocument.update({
          where: { key },
          data: { content, hash },
        });
        await syncMapEntities(tx, [key]);
        await verifyRelationalDocument(tx, { ...original, content, hash });
      },
      { timeout: 30000 },
    );
    assert.equal(
      (await prisma.mapCourse.findUniqueOrThrow({ where: { id: a } }))
        .sectionOrder,
      2,
    );
    assert.equal(
      (await prisma.mapCourse.findUniqueOrThrow({ where: { id: b } }))
        .sectionOrder,
      1,
    );
    // Failed updates must roll back both the cached document and relational entities.
    await assert.rejects(
      prisma.$transaction(async tx => {
        await tx.dataDocument.update({
          where: { key },
          data: { content: "{}", hash: "0".repeat(64) },
        });
        await syncMapEntities(tx, [key]);
      }),
      /Invalid/,
    );
    assert.equal(
      (await prisma.dataDocument.findUniqueOrThrow({ where: { key } })).hash,
      hash,
    );
    // Removing one line archives it without physically deleting its original record.
    parsed.features = parsed.features.filter(
      (f: { properties: { entityId: string } }) => f.properties.entityId !== a,
    );
    const removed = JSON.stringify(parsed);
    await prisma.$transaction(
      async tx => {
        await tx.dataDocument.update({
          where: { key },
          data: { content: removed, hash: contentHash(removed) },
        });
        await syncMapEntities(tx, [key]);
      },
      { timeout: 30000 },
    );
    assert.ok(
      (await prisma.mapCourse.findUniqueOrThrow({ where: { id: a } }))
        .archivedAt,
    );
    // Restore this document from the pre-edit copy; IDs and complete features survive.
    await prisma.$transaction(
      async tx => {
        await tx.dataDocument.update({
          where: { key },
          data: { content: original.content, hash: original.hash },
        });
        await syncMapEntities(tx, [key]);
        await verifyRelationalDocument(tx, original);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
      },
    );
    assert.equal(
      (await prisma.mapCourse.findUniqueOrThrow({ where: { id: a } }))
        .archivedAt,
      null,
    );
    console.log(
      "PASS: full backup migration, immutable originals, idempotency, per-line grouping, transaction rollback, archive and restore",
    );
  } finally {
    await disconnectPrisma();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
