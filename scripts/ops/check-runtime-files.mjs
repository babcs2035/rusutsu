import { access, readdir } from "node:fs/promises";

const required = [
  "server.js",
  "prisma/schema.prisma",
  "prisma.config.ts",
  "scripts/importCanonicalDataDocuments.ts",
  "scripts/importSkiResortShortNames.ts",
  "scripts/canonicalImportRuntime.ts",
  "scripts/canonicalImportSources.ts",
  "scripts/scheduleCrawlLatest.ts",
  "scripts/runCrawlLatestBatch.ts",
  "scripts/ops/check-readiness.mjs",
  "scripts/ops/check-existing-database.mjs",
  "scripts/ops/prepare-artifact-directories.mjs",
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
