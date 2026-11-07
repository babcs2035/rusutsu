import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const databaseUrl = process.env.MAP_CANONICAL_TEST_DATABASE_URL;
test("canonical maps: document-free edits, crawler adoption, summaries and concurrency", {
  skip: !databaseUrl,
}, async t => {
  const url = new URL(databaseUrl ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55491");
  assert.equal(url.pathname, "/postgres");
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATA_API_BASE_URL = "";
  process.env.DATA_DOCUMENT_ALLOW_BUNDLED_FIXTURES = "false";
  const root = path.resolve(
    "src/private/data/resorts-temporary/tmp/canonical-maps",
  );
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, "integration.mjs");
  await build({
    stdin: {
      contents: `export {prisma,disconnectPrisma} from '@/lib/prisma'; export * from '@/server/data-documents/repository'; export * from '@/server/course-lift/canonicalDocuments'; export * from '@/server/course-lift/canonicalCodec'; export * from '@/server/course-lift/mapData'; export * from '@/server/course-lift/operations'; export * from '@/server/course-lift/summaryClient'; export * from '@/server/crawl-latest/persistence'; export {crawlLatestRunInputSchema} from '@/server/crawl-latest/contract'; export {hashDataDocumentContent} from '@/server/data-documents/repositoryCore'; export {getFinalizedResortMapData} from '@/lib/finalizedResortGeojson';`,
      resolveDir: process.cwd(),
      sourcefile: "canonical-test.ts",
    },
    outfile: file,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "server-only-test",
        setup(b) {
          b.onResolve({ filter: /^server-only$/ }, () => ({
            path: "server-only",
            namespace: "stub",
          }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents: "",
            loader: "js",
          }));
        },
      },
    ],
  });
  const api = await import(pathToFileURL(file).href);
  const db = api.prisma;
  try {
    await db.$executeRawUnsafe(
      "TRUNCATE ski_resorts, data_documents, canonical_data_migrations, map_lifts, map_courses, map_course_groups, map_document_states, map_document_backups, ski_resort_operation_summaries CASCADE",
    );
    await db.skiResort.create({
      data: {
        id: "sample",
        nameJa: "テスト",
        nameEn: "Test",
        prefecture: "北海道",
        town: "町",
        latitude: 43,
        longitude: 140,
        topElevation: 1000,
        baseElevation: 500,
        verticalDrop: 500,
        numberOfCourses: 9,
        longestCourse: 1000,
        beginnersCoursesPercent: 30,
        intermediateCoursesPercent: 40,
        advancedCoursesPercent: 30,
        numberOfLifts: 4,
        ropeways: 0,
        gondolas: 0,
        quadLifts: 0,
        tripleLifts: 0,
        pairLifts: 4,
        singleLifts: 0,
        otherLifts: 0,
      },
    });
    await db.canonicalDataMigration.create({
      data: {
        key: api.CANONICAL_MAP_MIGRATION_KEY,
        sourceHash: "0".repeat(64),
        details: { test: true },
      },
    });
    const baseKey = "resorts-temporary/slope_before/sample.geojson",
      derivedKey = "resorts-temporary/slope_10m/sample.geojson",
      liftKey = "resorts-temporary/lift_before/sample.geojson",
      mappingKey = "resorts-temporary/latest_status_mapping/sample.json";
    const line = (id: string, name: string, group?: string) => ({
      type: "Feature",
      properties: {
        entityId: id,
        name,
        level: "初級",
        distance: 100,
        note: "元の説明",
        ...(group
          ? {
              courseGrouping: {
                id: group,
                name: "A",
                kind: "continuous",
                order: id.endsWith("1") ? 1 : 2,
              },
            }
          : {}),
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [140, 43],
          [140.001, 43.001],
        ],
      },
    });
    const lines = [
      line("a1", "A上部", "A"),
      line("a2", "A下部", "A"),
      line("b", "B"),
      line("c", "C"),
      line("unnamed", "無名_1"),
    ];
    const elevated = lines.map(feature => ({
      ...feature,
      properties: {
        ...feature.properties,
        horizontal_dist_map: 100,
        slope_dist_map: 110,
        elevation_diff_map: 30,
        avg_slope_deg_map: 15,
        max_slope_deg_map: 20,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [140, 43, 1000],
          [140.001, 43.001, 970],
        ],
      },
    }));
    const write = (
      key: string,
      data: unknown,
      expectedHash: string | null = null,
    ) => ({
      key,
      content: JSON.stringify(data),
      mediaType: key.endsWith("geojson")
        ? "application/geo+json"
        : "application/json",
      expectedHash,
    });
    const collection = (features: unknown[]) => ({
      type: "FeatureCollection",
      features,
    });
    await t.test(
      "writes base and elevated lines atomically, retaining no full map documents",
      async () => {
        await api.writeDataDocumentsDirect([
          write(derivedKey, collection(elevated)),
          write(baseKey, collection(lines)),
          write(
            liftKey,
            collection([line("l1", "第1リフト"), line("l2", "第2リフト")]),
          ),
        ]);
        assert.equal(await db.dataDocument.count(), 0);
        const row = await db.mapCourse.findUniqueOrThrow({
          where: { id: "a1" },
        });
        assert.equal(row.feature, null);
        assert.equal(row.derivedFeature, null);
        assert.equal(row.slopeDistance, 110);
        assert.equal(row.properties.distance, undefined);
        const rendered = await api.getDataDocumentDirect(baseKey);
        assert.equal(JSON.parse(rendered.content).features.length, 5);
        const summary = await db.skiResortOperationSummary.findUniqueOrThrow({
          where: { skiResortId: "sample" },
        });
        assert.equal(summary.courseTotal, 4);
        assert.equal(summary.courseActive, null);
      },
    );
    const mapping = {
      version: 1,
      courses: {
        sourceFile: "test.json",
        updatedAt: "2026-10-18T00:00:00Z",
        rows: [
          {
            geometryId: "a1",
            geojsonName: "A上部",
            crawledName: "A",
            crawledNames: ["A", "A別名"],
          },
          { geometryId: "a2", geojsonName: "A下部", crawledName: "A" },
          { geometryId: "b", geojsonName: "B", crawledName: "B" },
        ],
      },
      lifts: {
        sourceFile: "test.json",
        updatedAt: "2026-10-18T00:00:00Z",
        rows: [
          {
            geometryId: "l1",
            geojsonName: "第1リフト",
            crawledName: "第1リフト",
          },
          {
            geometryId: "l2",
            geojsonName: "第2リフト",
            crawledName: "第2リフト",
          },
        ],
      },
    };
    await api.writeDataDocumentsDirect([write(mappingKey, mapping)]);
    const crawl = (time: string, courseItems: unknown[], sourceMode = "LIVE") =>
      api.crawlLatestRunInputSchema.parse({
        schemaVersion: 1,
        producerId: "test",
        resortId: "sample",
        observedAt: time,
        completedAt: time,
        sourceMode,
        ...(sourceMode === "WAYBACK_VALIDATION"
          ? { archiveTimestamp: "20260101000000" }
          : {}),
        crawler: {},
        rawPayload: { test: true },
        categories: [
          {
            kind: "COURSES",
            state: "SUCCESS",
            data: courseItems,
            sourceUrls: ["https://example.com/courses"],
          },
          {
            kind: "LIFTS",
            state: "SUCCESS",
            data: [
              { name: "第1リフト", status: "△", update: "08:00", note: "減速" },
              { name: "第2リフト", status: "×", update: null, note: null },
            ],
            sourceUrls: ["https://example.com/lifts"],
          },
          ...["WEATHER", "COMMENT", "NEWS"].map(kind => ({
            kind,
            state: "NOT_SUPPORTED",
            sourceUrls: [],
          })),
        ],
      });
    await t.test(
      "adoption counts mapped groups and ignores unmapped courses",
      async () => {
        const input = crawl("2026-10-18T01:00:00Z", [
          { name: "A", status: "○", update: "08:00", note: "上部のみ" },
          { name: "B", status: "×", update: null, note: null },
        ]);
        input.issues = ["COURSES", "LIFTS"].map(categoryKind => ({
          categoryKind,
          severity: "WARNING",
          code: "CRAWLER.VALIDATION",
          message: `${categoryKind} count differs from expected count`,
          occurrences: 1,
          blocksPromotion: false,
        }));
        const saved = await api.persistCrawlLatestRun(input, "first");
        const categories = await db.crawlLatestCategorySnapshot.findMany({
          where: { runId: saved.runId, kind: { in: ["COURSES", "LIFTS"] } },
        });
        for (const category of categories) {
          assert.equal(category.validationState, "WARNING");
          assert.equal(category.eligibleForCurrent, true);
        }
        assert.equal(categories.length, 2);
        const a = await db.mapCourse.findUniqueOrThrow({ where: { id: "a1" } });
        assert.equal(a.status, "○");
        assert.equal(a.latestNote, "上部のみ");
        assert.ok(a.statusSnapshotId);
        assert.deepEqual(a.statusSourceUrls, ["https://example.com/courses"]);
        const summary = await db.skiResortOperationSummary.findUniqueOrThrow({
          where: { skiResortId: "sample" },
        });
        assert.equal(summary.courseTotal, 2);
        assert.equal(summary.courseActive, 1);
        assert.equal(summary.liftTotal, 2);
        assert.equal(summary.liftActive, 1);
        assert.equal(summary.calculationVersion, api.OPERATION_SUMMARY_VERSION);
        // 旧版の保存値も読み取り時に再集計し、次のクロールまで誤った総数を残さない。
        await db.skiResortOperationSummary.update({
          where: { skiResortId: "sample" },
          data: { courseTotal: 99, courseActive: 99, calculationVersion: 1 },
        });
        const concurrentSummaries = await Promise.all([
          api.findOperatingSummariesDirect(),
          api.findOperatingSummariesDirect(),
        ]);
        for (const counts of concurrentSummaries) {
          assert.deepEqual(counts.sample.courses, { total: 2, active: 1 });
        }
        assert.equal(
          (
            await db.skiResortOperationSummary.findUniqueOrThrow({
              where: { skiResortId: "sample" },
            })
          ).calculationVersion,
          api.OPERATION_SUMMARY_VERSION,
        );
        await db.$transaction((tx: unknown) =>
          api.refreshMapOperations(tx, ["sample"]),
        );
        const map = await api.getFinalizedResortMapData("sample");
        assert.equal(
          map.courses.features.find(
            (feature: { id: string }) => feature.id === "a1",
          ).properties.status,
          "○",
        );
      },
    );
    await t.test(
      "map sections share one course and unknown remains unknown",
      async () => {
        const saved = await api.getDataDocumentDirect(mappingKey);
        const sections = JSON.parse(JSON.stringify(mapping));
        sections.courses.rows[0].crawledName = "A上部";
        sections.courses.rows[0].crawledNames = ["A上部"];
        sections.courses.rows[1].crawledName = "A下部";
        await api.writeDataDocumentsDirect([
          write(mappingKey, sections, saved.hash),
        ]);
        await api.persistCrawlLatestRun(
          crawl("2026-10-18T01:10:00Z", [
            { name: "A上部", status: "○", update: null, note: null },
            { name: "A下部", status: "×", update: null, note: null },
            { name: "B", status: "△", update: null, note: null },
          ]),
          "sections",
        );
        const detail = await api.getFinalizedResortMapData("sample");
        assert.equal(detail.courseStatusSummary.total, 4);
        assert.equal(detail.courseStatusSummary.partial, 2);
        assert.equal(detail.courseStatusSummary.unknown, 2);
        assert.deepEqual(
          (await api.findOperatingSummariesDirect()).sample.courses,
          { total: 2, active: 2 },
        );
        await api.persistCrawlLatestRun(
          crawl("2026-10-18T01:20:00Z", [
            { name: "A上部", status: "○", update: null, note: null },
            { name: "A下部", status: "×", update: null, note: null },
            { name: "B", status: null, update: null, note: null },
          ]),
          "sections-unknown",
        );
        assert.deepEqual(
          (await api.findOperatingSummariesDirect()).sample.courses,
          { total: 2, active: null },
        );
        const current = await api.getDataDocumentDirect(mappingKey);
        await api.writeDataDocumentsDirect([
          write(mappingKey, mapping, current.hash),
        ]);
      },
    );
    await t.test(
      "missing mapped items become unknown; older/Wayback captures cannot overwrite current",
      async () => {
        await api.persistCrawlLatestRun(
          crawl("2026-10-18T02:00:00Z", [
            { name: "A", status: "△", update: null, note: "部分" },
          ]),
          "missing",
        );
        assert.equal(
          (await db.mapCourse.findUniqueOrThrow({ where: { id: "b" } })).status,
          null,
        );
        assert.equal(
          (await api.findOperatingSummariesDirect()).sample.courses.total,
          2,
        );
        assert.equal(
          (
            await db.skiResortOperationSummary.findUniqueOrThrow({
              where: { skiResortId: "sample" },
            })
          ).courseActive,
          null,
        );
        assert.ok(
          await db.crawlLatestIssue.count({
            where: { code: "MAPPING.OPERATION_MISSING" },
          }),
        );
        await api.persistCrawlLatestRun(
          crawl("2026-10-18T00:00:00Z", [
            { name: "A", status: "×", update: null, note: null },
          ]),
          "old",
        );
        await api.persistCrawlLatestRun(
          crawl(
            "2026-10-18T03:00:00Z",
            [{ name: "A", status: "×", update: null, note: null }],
            "WAYBACK_VALIDATION",
          ),
          "archive",
        );
        assert.equal(
          (await db.mapCourse.findUniqueOrThrow({ where: { id: "a1" } }))
            .status,
          "△",
        );
      },
    );
    await t.test(
      "mapping edits reproject immediately and stale multi-document edits roll back",
      async () => {
        const saved = await api.getDataDocumentDirect(mappingKey);
        mapping.courses.rows[2].crawledName = "A";
        await api.writeDataDocumentsDirect([
          write(mappingKey, mapping, saved.hash),
        ]);
        assert.equal(
          (await db.mapCourse.findUniqueOrThrow({ where: { id: "b" } })).status,
          "△",
        );
        assert.deepEqual(
          (await api.findOperatingSummariesDirect()).sample.courses,
          { total: 2, active: 2 },
        );
        const base = await api.getDataDocumentDirect(baseKey);
        await assert.rejects(
          api.writeDataDocumentsDirect([
            write(baseKey, collection([]), base.hash),
            write(mappingKey, mapping, saved.hash),
          ]),
        );
        assert.equal(
          await db.mapCourse.count({ where: { archivedAt: null } }),
          5,
        );
        const list = await api.listDataDocumentsDirect(
          "resorts-temporary/slope_before/",
        );
        assert.equal(list[0].geoJsonFeatureCount, 5);
      },
    );
    await t.test(
      "coordinate edits invalidate elevations without changing map group counts",
      async () => {
        const saved = await api.getDataDocumentDirect(baseKey);
        const data = JSON.parse(saved.content);
        data.features[0].geometry.coordinates[0][0] = 141;
        await api.writeDataDocumentsDirect([write(baseKey, data, saved.hash)]);
        const row = await db.mapCourse.findUniqueOrThrow({
          where: { id: "a1" },
        });
        assert.equal(row.elevationReady, false);
        assert.equal(row.derivedGeometry, null);
        assert.equal(
          (
            await db.skiResortOperationSummary.findUniqueOrThrow({
              where: { skiResortId: "sample" },
            })
          ).courseTotal,
          2,
        );
      },
    );
    await t.test(
      "two concurrent writes with one hash have exactly one winner",
      async () => {
        const saved = await api.getDataDocumentDirect(mappingKey);
        const outcomes = await Promise.allSettled([
          api.writeDataDocumentsDirect([
            write(
              mappingKey,
              {
                ...mapping,
                courses: {
                  ...mapping.courses,
                  updatedAt: "2026-10-18T03:00:00Z",
                },
              },
              saved.hash,
            ),
          ]),
          api.writeDataDocumentsDirect([
            write(
              mappingKey,
              {
                ...mapping,
                version: 1,
                courses: {
                  ...mapping.courses,
                  updatedAt: "2026-10-18T04:00:00Z",
                },
              },
              saved.hash,
            ),
          ]),
        ]);
        // Change both payloads so even a no-op cannot retain the initial hash.
        assert.equal(
          outcomes.filter(outcome => outcome.status === "fulfilled").length,
          1,
        );
      },
    );
    await t.test(
      "CLI cutover backs up documents, preserves IDs and coordinates, and is idempotent",
      async () => {
        await db.$executeRawUnsafe(
          "TRUNCATE map_courses, map_lifts, map_course_groups, map_document_states, map_document_backups, course_recommendation_features CASCADE",
        );
        await db.canonicalDataMigration.deleteMany({
          where: { key: api.CANONICAL_MAP_MIGRATION_KEY },
        });
        const raw = [
          write(baseKey, collection(lines)),
          write(derivedKey, collection(elevated)),
          write(
            liftKey,
            collection([line("l1", "第1リフト"), line("l2", "第2リフト")]),
          ),
          write(mappingKey, mapping),
          write("resorts-temporary/slope_detail/sample.json", [
            {
              entityId: "b",
              name: "B",
              level: "初級",
              distance: 100,
              note: "元の説明",
            },
          ]),
        ];
        await db.dataDocument.createMany({
          data: raw.map(({ expectedHash: _expectedHash, ...document }) => ({
            ...document,
            hash: api.hashDataDocumentContent(document.content),
          })),
        });
        const run = (args: string[]) =>
          promisify(execFile)(
            process.execPath,
            [
              "--import",
              "tsx",
              "src/private/scripts/migrateCanonicalMaps.ts",
              ...args,
            ],
            {
              cwd: process.cwd(),
              env: {
                ...process.env,
                DATABASE_URL: databaseUrl,
                DATA_API_BASE_URL: "",
              },
            },
          );
        const dry = await run(["--dry-run"]);
        const inputHash = JSON.parse(dry.stdout.trim()).inputHash;
        assert.equal(await db.dataDocument.count(), 5);
        await assert.rejects(run(["--deploy", "--dry-run"]));
        assert.equal(await db.dataDocument.count(), 5);
        await run(["--apply", "--expected-hash", inputHash]);
        assert.equal(await db.dataDocument.count(), 0);
        assert.equal(await db.mapDocumentBackup.count(), 5);
        assert.equal(
          await db.mapCourse.count({ where: { archivedAt: null } }),
          5,
        );
        const row = await db.mapCourse.findUniqueOrThrow({
          where: { id: "a1" },
        });
        assert.deepEqual(row.geometry, lines[0].geometry);
        assert.deepEqual(row.derivedGeometry, elevated[0].geometry);
        assert.equal(row.slopeDistance, 110);
        assert.equal(row.status, "△");
        assert.equal(row.feature, null);
        assert.ok(
          (
            await run(["--apply", "--expected-hash", inputHash])
          ).stdout.includes("already enabled"),
        );
        assert.ok((await run(["--deploy"])).stdout.includes("already enabled"));
      },
    );
    await t.test(
      "legacy detail attributes migrate to columns and edits never resurrect stale JSON",
      async () => {
        const {
          id: _id,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...fields
        } = await db.skiResort.findUniqueOrThrow({ where: { id: "sample" } });
        await db.skiResort.create({
          data: {
            ...fields,
            id: "detail-resort",
            nameJa: "詳細のみ",
            sourceResortIds: [],
          },
        });
        const detailKey = "resorts-temporary/slope_detail/detail-resort.json";
        const beforeKey =
          "resorts-temporary/slope_before/detail-resort.geojson";
        // A retained legacy detail document is available when importing bare map lines.
        await db.dataDocument.create({
          data: {
            key: detailKey,
            content: JSON.stringify([
              { name: "林間", level: "上級", distance: 777, note: "旧説明" },
            ]),
            mediaType: "application/json",
            hash: "1".repeat(64),
          },
        });
        const feature = {
          type: "Feature",
          properties: { entityId: "detail-line", name: "林間" },
          geometry: {
            type: "LineString",
            coordinates: [
              [140, 43],
              [140.001, 43.001],
            ],
          },
        };
        await api.writeDataDocumentsDirect([
          write(beforeKey, collection([feature])),
        ]);
        const row = await db.mapCourse.findUniqueOrThrow({
          where: { id: "detail-line" },
        });
        assert.equal(row.difficulty, "上級");
        assert.equal(Object.hasOwn(row, "distance"), false);
        const legacy = await api.getDataDocumentDirect(detailKey);
        await db.$transaction((tx: unknown) =>
          api.writeCanonicalMapDocument(
            tx,
            { ...legacy, version: 1 },
            new Set([detailKey]),
            { migrating: true },
          ),
        );
        await db.dataDocument.delete({ where: { key: detailKey } });
        const saved = await api.getDataDocumentDirect(beforeKey);
        const updated = JSON.parse(saved.content);
        updated.features[0].properties.note = "新説明";
        await api.writeDataDocumentsDirect([
          write(beforeKey, updated, saved.hash),
        ]);
        const detail = JSON.parse(
          (await api.getDataDocumentDirect(detailKey)).content,
        );
        assert.equal(detail[0].note, "新説明");
        const current = await api.getDataDocumentDirect(detailKey);
        detail[0].note = "距離を含む更新";
        detail[0].distance = 888;
        await api.writeDataDocumentsDirect([
          write(detailKey, detail, current.hash),
        ]);
        assert.equal(
          (
            await db.mapCourse.findUniqueOrThrow({
              where: { id: "detail-line" },
            })
          ).distance,
          undefined,
        );
        assert.equal(
          await db.dataDocument.count({ where: { key: detailKey } }),
          0,
        );
        const beforeBatch = await api.getDataDocumentDirect(beforeKey);
        const detailBatch = await api.getDataDocumentDirect(detailKey);
        const batchMap = JSON.parse(beforeBatch.content);
        const batchDetail = JSON.parse(detailBatch.content);
        batchMap.features[0].properties.note = "一括更新";
        batchDetail[0].note = "一括更新詳細";
        batchDetail[0].distance = 999;
        const results = await api.writeDataDocumentsDirect([
          write(beforeKey, batchMap, beforeBatch.hash),
          write(detailKey, batchDetail, detailBatch.hash),
        ]);
        for (const result of results) {
          const current = await api.getDataDocumentDirect(result.key);
          assert.equal(result.hash, current.hash);
          assert.equal(result.content, current.content);
          const state = await db.mapDocumentState.findUniqueOrThrow({
            where: { key: result.key },
          });
          assert.equal(state.hash, current.hash);
        }
        const beforeIndirect = await api.getDataDocumentDirect(beforeKey);
        const indirectDetail = await api.getDataDocumentDirect(detailKey);
        const indirectItems = JSON.parse(indirectDetail.content);
        indirectItems[0].note = "間接更新詳細";
        indirectItems[0].distance = 1000;
        await api.writeDataDocumentsDirect([
          write(detailKey, indirectItems, indirectDetail.hash),
        ]);
        const afterIndirect = await api.getDataDocumentDirect(beforeKey);
        assert.equal(afterIndirect.version, beforeIndirect.version + 1);
        assert.notEqual(afterIndirect.hash, beforeIndirect.hash);
      },
    );
    await t.test(
      "non-line map annotations remain editable but do not affect operating counts",
      async () => {
        const original = await db.skiResort.findUniqueOrThrow({
          where: { id: "sample" },
        });
        const {
          id: _id,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...fields
        } = original;
        await db.skiResort.create({
          data: { ...fields, id: "annotated", nameJa: "注記つき" },
        });
        const key = "resorts-temporary/slope_before/annotated.geojson";
        await api.writeDataDocumentsDirect([
          write(key, collection([line("annotated-a", "A")])),
        ]);
        const saved = await api.getDataDocumentDirect(key);
        const data = JSON.parse(saved.content);
        data.features.push({
          type: "Feature",
          properties: { entityId: "annotation", name: "注記" },
          geometry: { type: "Point", coordinates: [140, 43] },
        });
        await api.writeDataDocumentsDirect([write(key, data, saved.hash)]);
        assert.equal(
          JSON.parse((await api.getDataDocumentDirect(key)).content).features
            .length,
          2,
        );
        const summary = await db.skiResortOperationSummary.findUniqueOrThrow({
          where: { skiResortId: "annotated" },
        });
        assert.equal(summary.courseTotal, 1);
        assert.equal(summary.courseActive, null);
        assert.equal(
          (await api.getFinalizedResortMapData("annotated")).courses.features
            .length,
          1,
        );
      },
    );
    await t.test(
      "mapping coverage keeps usable states, groups gaps, and applies recorded listing policy",
      async () => {
        const savedMapping = await api.getDataDocumentDirect(mappingKey);
        const activeMapping = JSON.parse(JSON.stringify(mapping));
        activeMapping.courses.rows[0].crawledNames = ["A", "A別名"];
        activeMapping.courses.rows[1].crawledNames = ["A", "A別名"];
        activeMapping.courses.rows[2].crawledName = "B";
        await api.writeDataDocumentsDirect([
          write(mappingKey, activeMapping, savedMapping.hash),
        ]);
        const ambiguous = await api.persistCrawlLatestRun(
          crawl("2026-11-03T00:00:00Z", [
            { name: "A", status: "○", update: null, note: null },
            { name: "A別名", status: "×", update: null, note: null },
            { name: "B", status: null, update: null, note: null },
          ]),
          "mapping-ambiguous",
        );
        const issues = await db.crawlLatestIssue.findMany({
          where: { runId: ambiguous.runId },
        });
        const gap = issues.find(
          (issue: { code: string }) =>
            issue.code === "MAPPING.AMBIGUOUS_OPERATION",
        );
        assert.ok(gap);
        assert.equal(gap.blocksPromotion, false);
        assert.equal(gap.occurrences, 1);
        assert.deepEqual(gap.details.gaps[0].entityIds.sort(), ["a1", "a2"]);
        assert.ok(
          issues.some(
            (issue: { code: string }) =>
              issue.code === "MAPPING.OPERATION_STATUS_MISSING",
          ),
        );
        const a = await db.mapCourse.findUniqueOrThrow({ where: { id: "a1" } });
        assert.equal(a.status, null);
        assert.ok(a.statusSnapshotId);

        const missing = await api.persistCrawlLatestRun(
          crawl("2026-11-03T00:10:00Z", [
            { name: "A", status: "○", update: null, note: null },
          ]),
          "mapping-missing",
        );
        assert.equal(
          (await db.mapCourse.findUniqueOrThrow({ where: { id: "a1" } }))
            .status,
          "○",
        );
        assert.equal(
          (await db.mapCourse.findUniqueOrThrow({ where: { id: "b" } })).status,
          null,
        );
        assert.equal(
          await db.crawlLatestIssue.count({
            where: { runId: missing.runId, code: "MAPPING.OPERATION_MISSING" },
          }),
          1,
        );
        const missingCategory =
          await db.crawlLatestCategorySnapshot.findFirstOrThrow({
            where: { runId: missing.runId, kind: "COURSES" },
          });
        assert.equal(missingCategory.validationState, "WARNING");
        assert.equal(missingCategory.eligibleForCurrent, true);

        // 読み取りは保存済みの反映結果を使い、古い識別子を最新の生データで補わない。
        await db.mapCourse.update({
          where: { id: "a1" },
          data: {
            status: "×",
            statusSnapshotId: "old-snapshot",
            officialUpdatedAt: "Apr 30",
          },
        });
        const guarded = await api.readCanonicalResortMapDirect("sample");
        const guardedA = guarded.data.courses.features.find(
          (feature: { id: string }) => feature.id === "a1",
        );
        assert.equal(guardedA.properties.status, null);
        assert.equal(guardedA.properties.update, null);
        await db.$transaction((tx: unknown) =>
          api.refreshMapOperations(tx, ["sample"]),
        );

        const fields = { name: true, status: true, update: false, note: false };
        const capabilityKey =
          "resorts-temporary/latest_status_capability/sample.json";
        await api.writeDataDocumentsDirect([
          write(capabilityKey, {
            version: 1,
            resortId: "sample",
            observedAt: "2026-01-01T00:00:00Z",
            crawlerSourceHash: null,
            source: {
              mode: "WAYBACK_VALIDATION",
              archiveTimestamp: "20250223161454",
              urls: ["https://example.com/courses"],
            },
            courses: {
              available: true,
              listingMode: "operating-only",
              count: 2,
              names: ["A", "B"],
              statuses: ["○"],
              fields,
            },
            lifts: {
              available: false,
              count: 0,
              names: [],
              statuses: [],
              fields,
            },
            conditions: {
              comment: false,
              news: false,
              points: [],
              fields: {
                update: false,
                weather: false,
                temperature: false,
                snowDepth: false,
                snowfall: false,
                condition: false,
                windSpeed: false,
              },
            },
          }),
        ]);
        const listing = await api.persistCrawlLatestRun(
          crawl("2026-11-03T00:20:00Z", [
            { name: "A", status: "○", update: null, note: null },
          ]),
          "mapping-operating-only",
        );
        assert.equal(
          await db.crawlLatestIssue.count({
            where: { runId: listing.runId, code: "MAPPING.OPERATION_MISSING" },
          }),
          0,
        );
        assert.equal(
          (await db.mapCourse.findUniqueOrThrow({ where: { id: "b" } })).status,
          null,
        );
        assert.equal(
          (await db.mapCourse.findUniqueOrThrow({ where: { id: "a1" } }))
            .status,
          "○",
        );
        await db.dataDocument.delete({ where: { key: capabilityKey } });
      },
    );
    await t.test(
      "without adopted current snapshots, canonical map reads and summaries clear stale operation fields",
      async () => {
        await db.crawlLatestCurrent.deleteMany({
          where: { skiResortId: "sample", kind: { in: ["COURSES", "LIFTS"] } },
        });
        const staleFields = {
          status: "○",
          statusName: "Apr 30 old status",
          latestNote: "Apr 30 old note",
          officialUpdatedAt: "Apr 30 old update",
          statusObservedAt: new Date("2026-04-30T08:00:00Z"),
          statusSnapshotId: "apr-30-snapshot",
          statusSourceUrls: ["https://old.example/status"],
          hasStatusSource: true,
        };
        await db.mapCourse.updateMany({
          where: { resortId: "sample", archivedAt: null },
          data: staleFields,
        });
        await db.mapLift.updateMany({
          where: { resortId: "sample", archivedAt: null },
          data: staleFields,
        });

        const map = await api.readCanonicalResortMapDirect("sample");
        assert.equal(map.enabled, true);
        assert.ok(map.data);
        assert.equal(map.data.courses?.observedAt, null);
        assert.deepEqual(map.data.courses?.sourceUrls, []);
        assert.deepEqual(map.data.courseStatusSummary, {
          total: 4,
          open: 0,
          partial: 0,
          closed: 0,
          unknown: 4,
          observedAt: null,
          sourceUrls: [],
          updates: [],
          sourceLabels: undefined,
        });
        for (const feature of map.data.courses?.features ?? []) {
          assert.equal(feature.properties.status, null);
          assert.equal(feature.properties.update, null);
          assert.equal(feature.properties.latestNote, null);
          assert.equal(feature.latestStatusName, null);
          assert.equal(feature.statusSnapshotId, null);
          assert.deepEqual(feature.sourceUrls, []);
        }
        assert.equal(map.data.lifts?.observedAt, null);
        assert.deepEqual(map.data.lifts?.sourceUrls, []);
        for (const feature of map.data.lifts?.features ?? []) {
          assert.equal(feature.properties.status, null);
          assert.equal(feature.properties.update, null);
          assert.equal(feature.properties.latestNote, null);
          assert.equal(feature.latestStatusName, null);
          assert.equal(feature.statusSnapshotId, null);
        }

        const [summary] = await db.$transaction((tx: unknown) =>
          api.calculateMapOperationSummaries(tx, ["sample"]),
        );
        assert.equal(summary.courseTotal, 2);
        assert.equal(summary.courseActive, null);
        assert.equal(summary.liftTotal, 2);
        assert.equal(summary.liftActive, null);
      },
    );
  } finally {
    await api.disconnectPrisma();
  }
});
