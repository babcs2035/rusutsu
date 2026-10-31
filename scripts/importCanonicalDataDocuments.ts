import path from "node:path";
import { prepareWeatherLinksMigration } from "../src/features/weather/weatherLinksMigration";
import {
  DATA_DOCUMENT_INITIALIZATION_KEY,
  runOneTimeImport,
} from "../src/server/data-documents/initialization";
import { readImportMode, withImportDatabase } from "./canonicalImportRuntime";
import {
  collectImportDocuments,
  DATA_ROOT,
  hashContent,
  readValidatedJsonFile,
} from "./canonicalImportSources";

async function main() {
  const mode = readImportMode();
  // Validate every source before starting a DB transaction, even existing keys.
  const documents = await collectImportDocuments();
  // 初回作成時も天気URLを同じリンク文書に含める。以後の正本はDBだけ。
  const weatherSource = JSON.parse(
    await readValidatedJsonFile(
      path.join(DATA_ROOT, "SkiResortWeatherIds.json"),
    ),
  );
  for (const document of documents) {
    if (document.key !== "SkiResortLinks.json") continue;
    document.content = prepareWeatherLinksMigration(
      document.content,
      weatherSource,
    ).content;
    document.hash = hashContent(document.content);
  }
  const sourceHash = hashContent(
    JSON.stringify(documents.map(({ key, hash }) => [key, hash])),
  );
  if (mode === "--dry-run") {
    console.log(
      JSON.stringify({
        status: "preflight_passed",
        files: documents.length,
        sourceHash,
      }),
    );
    return;
  }
  const result = await withImportDatabase(database =>
    runOneTimeImport(
      database,
      DATA_DOCUMENT_INITIALIZATION_KEY,
      sourceHash,
      async ({ prisma }) => {
        if ((await prisma.skiResort.count()) === 0)
          throw new Error(
            "SkiResort master is empty. Restore a database backup before initializing documents.",
          );
        let created = 0;
        for (let index = 0; index < documents.length; index += 50) {
          const batch = documents.slice(index, index + 50);
          created += (
            await prisma.dataDocument.createMany({
              data: batch.map(document => ({ ...document, version: 1 })),
              skipDuplicates: true,
            })
          ).count;
          const rows = await prisma.dataDocument.findMany({
            where: { key: { in: batch.map(document => document.key) } },
            select: { key: true, content: true, hash: true },
          });
          if (rows.length !== batch.length)
            throw new Error("Imported document count verification failed");
          for (const row of rows) {
            if (hashContent(row.content) !== row.hash)
              throw new Error(`Database content/hash mismatch: ${row.key}`);
          }
        }
        return {
          files: documents.length,
          created,
          preserved: documents.length - created,
        };
      },
    ),
  );
  console.log(JSON.stringify(result));
}
main().catch(error => {
  console.error(
    `DataDocument import failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
