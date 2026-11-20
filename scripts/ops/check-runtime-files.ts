import { existsSync } from "node:fs";
import { access, readdir } from "node:fs/promises";

for (const file of [
  ".env",
  ".env.local",
  ".env.production",
  "backups",
  "src/private/data/backups",
  "src/private/data/resorts-temporary/tmp",
  "src/private/data/resorts-temporary/logs",
]) {
  if (existsSync(file)) throw new Error("Private local data in runtime image.");
}

const required = [
  "server.js",
  "prisma/schema.prisma",
  "prisma.config.ts",
  "node_modules/prisma/build/index.js",
  "scripts/importCanonicalDataDocuments.ts",
  "scripts/importSkiResortShortNames.ts",
  "scripts/canonicalImportRuntime.ts",
  "scripts/canonicalImportSources.ts",
  "scripts/scheduleCrawlLatest.ts",
  "scripts/runCrawlLatestBatch.ts",
  "scripts/ops/check-readiness.ts",
  "scripts/ops/check-existing-database.ts",
  "scripts/ops/prepare-artifact-directories.ts",
  "src/private/scripts/rebuildCourseRecommendations.ts",
  "src/private/scripts/migrateCanonicalMaps.ts",
  "src/server/course-lift/canonicalDocuments.ts",
  "src/server/course-lift/operations.ts",
  "src/server/course-recommendations/projection.ts",
  "src/features/course-recommendations/algorithm.ts",
  "src/features/latest-status-mapping/server/mappingFiles.ts",
  "src/features/resort-detail/utils/detailMetrics.ts",
  "src/private/scripts/crawlYukiMagi.ts",
  "src/private/data/SkiAreaNameDict.json",
  "src/private/data/SkiResortNameAliases.json",
  ".shared/skills/collect-ski-lift-ticket-pricing/scripts/validate-lift-ticket.mjs",
  // These five were untracked during cutover. A parent-only commit must fail
  // the image build until the private submodule commit includes them.
  ...[
    "canmore-ski-village",
    "charmant-hiuchi",
    "grandeco-snow-resort",
    "gransnow-okuibuki",
    "sanlaiva",
  ].map(name => `src/private/scripts/crawl_latest/resorts/${name}.ts`),
];
for (const file of required) await access(file);
const crawlers = (
  await readdir("src/private/scripts/crawl_latest/resorts")
).filter(
  name =>
    name.endsWith(".ts") &&
    name !== "template.ts" &&
    !name.endsWith("_before.ts") &&
    !/\.(test|spec)\.ts$/.test(name),
);
if (!crawlers.length) throw new Error("No runtime crawler files found.");
console.log(`Runtime files verified; ${crawlers.length} crawler entry points.`);
