import path from "node:path";
import {
  runOneTimeImport,
  SHORT_NAME_INITIALIZATION_KEY,
} from "../src/server/data-documents/initialization";
import { readImportMode, withImportDatabase } from "./canonicalImportRuntime";
import {
  DATA_ROOT,
  hashContent,
  readValidatedJsonFile,
  shortNameSourceSchema,
} from "./canonicalImportSources";

async function main() {
  const mode = readImportMode();
  const content = await readValidatedJsonFile(
    path.join(DATA_ROOT, "SkiResortNameAliases.json"),
  );
  const { resorts } = shortNameSourceSchema.parse(JSON.parse(content));
  const sourceHash = hashContent(content);
  if (mode === "--dry-run") {
    console.log(
      JSON.stringify({
        status: "preflight_passed",
        resorts: resorts.length,
        sourceHash,
      }),
    );
    return;
  }
  const result = await withImportDatabase(database =>
    runOneTimeImport(
      database,
      SHORT_NAME_INITIALIZATION_KEY,
      sourceHash,
      async ({ prisma }) => {
        const existing = await prisma.skiResort.findMany({
          where: { id: { in: resorts.map(resort => resort.id) } },
          select: { id: true },
        });
        const ids = new Set(existing.map(resort => resort.id));
        const unknown = resorts.filter(resort => !ids.has(resort.id));
        if (unknown.length > 0)
          throw new Error(
            `Restore or reconcile SkiResort master before import. Unknown ids: ${unknown.map(resort => resort.id).join(", ")}`,
          );
        let updated = 0;
        for (const resort of resorts)
          updated += (
            await prisma.skiResort.updateMany({
              where: { id: resort.id, shortName: null },
              data: { shortName: resort.shortName },
            })
          ).count;
        return {
          resorts: resorts.length,
          updated,
          preserved: resorts.length - updated,
        };
      },
    ),
  );
  console.log(JSON.stringify(result));
}
main().catch(error => {
  console.error(
    `Short name import failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
