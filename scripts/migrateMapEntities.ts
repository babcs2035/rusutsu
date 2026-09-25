/** Additive, hash-guarded course/lift backfill. Default: dry-run. */
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import {
  contentHash,
  MAP_ENTITIES_MIGRATION_KEY,
  type MapSourceDocument,
  makeMapMigrationPlan,
  primaryMapKey,
} from "../src/server/course-lift/migrationPlan";
import {
  syncMapEntities,
  verifyRelationalDocument,
} from "../src/server/course-lift/repository";

const args = process.argv.slice(2);
const option = (key: string) => {
  const index = args.indexOf(key);
  return index < 0 ? null : (args[index + 1] ?? null);
};
const apply = args.includes("--apply");
const backup = option("--from-backup");
const expected = option("--expected-hash");
const reportPath = path.resolve(
  option("--report") ??
    "src/private/data/resorts-temporary/tmp/map-entities-migration/report.json",
);
const privateRoot = path.resolve("src/private");
if (!reportPath.startsWith(privateRoot + path.sep))
  throw new Error("Report must be inside src/private");
for (let i = 0; i < args.length; i++) {
  if (["--from-backup", "--expected-hash", "--report"].includes(args[i])) {
    if (!args[i + 1] || args[i + 1].startsWith("--"))
      throw new Error(`Missing value: ${args[i]}`);
    i++;
  } else if (!["--apply", "--dry-run"].includes(args[i]))
    throw new Error(`Unknown argument: ${args[i]}`);
}
if (apply && (backup || args.includes("--dry-run") || !expected))
  throw new Error(
    "Apply requires live DB and --expected-hash from a reviewed dry-run",
  );
const selected = (key: string) =>
  /^resorts-temporary\/(?:slope_[^/]+|lift_[^/]+|latest_status_mapping)(?:\/|\.json$)/u.test(
    key,
  ) || key === "SkiResortLinks.json";
let disconnect: (() => Promise<void>) | undefined;
async function main() {
  let documents: MapSourceDocument[];
  let db: typeof import("../src/lib/prisma").prisma | undefined;
  if (backup) {
    const manifest = JSON.parse(await fs.readFile(backup, "utf8"));
    documents = await Promise.all(
      manifest.documents.map(async (d: MapSourceDocument) => {
        if (
          !selected(d.key) ||
          d.key.split("/").some(p => p === ".." || p === ".") ||
          path.isAbsolute(d.key)
        )
          throw new Error("Unsafe/out-of-scope manifest key");
        return {
          ...d,
          mediaType: d.key.endsWith(".geojson")
            ? "application/geo+json"
            : "application/json",
          content: await fs.readFile(
            path.join(privateRoot, "data", d.key),
            "utf8",
          ),
        };
      }),
    );
  } else {
    const mod = await import("../src/lib/prisma");
    db = mod.prisma;
    disconnect = mod.disconnectPrisma;
    documents = (
      await db.dataDocument.findMany({ orderBy: { key: "asc" } })
    ).filter(d => selected(d.key));
  }
  if (!documents.length) throw new Error("No source documents");
  const plan = makeMapMigrationPlan(documents);
  const inputHash = contentHash(
    JSON.stringify(
      documents
        .map(d => [d.key, d.hash, d.version])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ),
  );
  const report = {
    mode: apply ? "apply" : "dry-run",
    committed: false,
    inputHash,
    sourceDocuments: documents.length,
    changedDocuments: plan.changes.length,
    courses: plan.entities.filter(e => e.kind === "course").length,
    lifts: plan.entities.filter(e => e.kind === "lift").length,
    issues: plan.issues,
    entities: plan.entities,
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      ...report,
      entities: undefined,
      issues: plan.issues.length,
      report: reportPath,
    }),
  );
  if (!apply) return;
  if (expected !== inputHash)
    throw new Error("Source differs from reviewed dry-run");
  if (!db) throw new Error("Live DB required");
  await db.$transaction(
    async tx => {
      // Serialize against every legacy document writer, not only this command.
      await tx.$executeRawUnsafe(
        'LOCK TABLE "data_documents" IN SHARE ROW EXCLUSIVE MODE',
      );
      const now = (await tx.dataDocument.findMany()).filter(d =>
        selected(d.key),
      );
      const nowHash = contentHash(
        JSON.stringify(
          now
            .map(d => [d.key, d.hash, d.version])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        ),
      );
      if (nowHash !== inputHash)
        throw new Error("Documents changed during migration; retry dry-run");
      for (const d of documents)
        await tx.mapDocumentBackup.upsert({
          where: { key_hash: { key: d.key, hash: d.hash } },
          create: {
            key: d.key,
            hash: d.hash,
            content: d.content,
            mediaType: d.mediaType,
            version: d.version,
          },
          update: {},
        });
      for (const d of plan.changes) {
        const previous = documents.find(before => before.key === d.key);
        if (!previous) throw new Error(`Missing original: ${d.key}`);
        const result = await tx.dataDocument.updateMany({
          where: { key: d.key, hash: previous.hash },
          data: { content: d.content, hash: d.hash, version: { increment: 1 } },
        });
        if (result.count !== 1) throw new Error(`Conflict: ${d.key}`);
      }
      await syncMapEntities(
        tx,
        plan.documents.filter(d => primaryMapKey(d.key)).map(d => d.key),
      );
      for (const d of plan.documents.filter(d => primaryMapKey(d.key)))
        await verifyRelationalDocument(tx, d);
      await tx.canonicalDataMigration.upsert({
        where: { key: MAP_ENTITIES_MIGRATION_KEY },
        create: {
          key: MAP_ENTITIES_MIGRATION_KEY,
          sourceHash: inputHash,
          details: { inputHash, courses: report.courses, lifts: report.lifts },
        },
        update: {
          details: { inputHash, courses: report.courses, lifts: report.lifts },
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 300000,
    },
  );
  await fs.writeFile(
    reportPath,
    `${JSON.stringify({ ...report, committed: true }, null, 2)}\n`,
  );
  console.log(
    "Applied and verified; original documents preserved in map_document_backups.",
  );
}
main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : "Migration failed");
    process.exitCode = 1;
  })
  .finally(async () => disconnect?.());
