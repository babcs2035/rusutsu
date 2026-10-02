import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { verifyRemoteWorkflow } from "./remoteIntegration";

// This suite never reads DATABASE_URL. It is opt-in and restricted to the
// disposable local server created for this task, to prevent production writes.
const testDatabase = process.env.EDITOR_WORKFLOW_TEST_DATABASE_URL;
test("editor requests: real PostgreSQL authorization, corrections, atomicity and concurrency", {
  skip: !testDatabase,
}, async t => {
  const url = new URL(testDatabase ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55489");
  assert.equal(url.pathname, "/postgres");
  process.env.DATABASE_URL = testDatabase;
  process.env.DATA_API_BASE_URL = "";
  process.env.ALLOW_BUNDLED_DATA_FIXTURES = "false";
  const root = path.join(
    process.cwd(),
    "src/private/data/resorts-temporary/tmp/editor-workflow",
  );
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, "integration-bundle.mjs");
  await build({
    stdin: {
      contents: `
      export { actors } from 'editor-test-auth';
      export { prisma, disconnectPrisma } from '@/lib/prisma';
      export * from '@/features/edit-requests/actions';
      export * from '@/server/edit-requests/repository';
      export * from '@/lib/requireAdmin';
      export * from '@/lib/requireEditor';
      export * from '@/app/admin/actions';
      export * from '@/features/links/actions';
      export * from '@/features/lift/actions';
      export * from '@/features/slope/actions';
      export * from '@/features/ticket/actions';
      export * from '@/features/review/actions';
      export * from '@/features/review/publicationActions';
      export * from '@/features/latest-status-mapping/actions';
      export * from '@/server/data-documents/client';
      export * from '@/lib/skiResortData';
      export * from '@/server/edit-requests/workflow';
      export * from '@/server/edit-requests/authPages';
      export { hashDataDocumentContent } from '@/server/data-documents/repositoryCore';
      export { adminSkiResortUpdateSchema } from '@/server/ski-resorts/adminContract';
      export { REVIEW_CATEGORY_IDS } from '@/features/reviews/types';
      export { POST as internalEditRequestPOST } from '@/app/api/internal/v1/edit-requests/route';
    `,
      resolveDir: process.cwd(),
      sourcefile: "editor-integration.ts",
      loader: "ts",
    },
    outfile: file,
    platform: "node",
    format: "esm",
    bundle: true,
    packages: "external",
    plugins: [
      {
        name: "isolated-auth-and-next-request-runtime",
        setup(builder) {
          builder.onResolve(
            {
              filter:
                /^(server-only|editor-test-auth|next\/cache|next\/server|next\/navigation|@\/auth)$/,
            },
            args => ({ path: args.path, namespace: "editor-test" }),
          );
          builder.onLoad({ filter: /.*/, namespace: "editor-test" }, args => ({
            contents:
              args.path === "server-only"
                ? "export {}"
                : args.path === "editor-test-auth"
                  ? "import { AsyncLocalStorage } from 'node:async_hooks'; export const actors = new AsyncLocalStorage();"
                  : args.path === "@/auth"
                    ? "import { actors } from 'editor-test-auth'; export async function auth() { const id = actors.getStore(); return id ? { user: { id, role: 'admin' } } : null; }"
                    : args.path === "next/cache"
                      ? "export function revalidatePath() {}"
                      : args.path === "next/navigation"
                        ? "export function redirect(path) { throw new Error('REDIRECT:' + path); }"
                        : "export function after() {}",
            loader: "js",
          }));
        },
      },
    ],
  });
  // The generated bundle includes actual production action / repository code;
  // only the signed-in identity and Next response hooks are substituted.
  const api = await import(pathToFileURL(file).href);
  const db = api.prisma;
  const actor = <T>(id: string | null, action: () => Promise<T>): Promise<T> =>
    api.actors.run(id, action);
  const testId = "integration-resort";
  const data = api.adminSkiResortUpdateSchema.parse({
    nameJa: "テストスキー場",
    nameEn: "Integration Resort",
    shortName: null,
    nameRuby: [],
    formerNames: [],
    readingNeedsReview: false,
    isActive: true,
    prefecture: "北海道",
    town: "テスト町",
    latitude: 43,
    longitude: 140,
    topElevation: 1000,
    baseElevation: 500,
    verticalDrop: 500,
    numberOfCourses: 1,
    longestCourse: 1000,
    steepestSlope: null,
    beginnersCoursesPercent: 30,
    intermediateCoursesPercent: 40,
    advancedCoursesPercent: 30,
    courseImages: [],
    typeNotPressed: null,
    typePressed: null,
    typeBump: null,
    angleMax: null,
    angleAvg: null,
    numberOfLifts: 1,
    ropeways: 0,
    gondolas: 0,
    quadLifts: 0,
    tripleLifts: 0,
    pairLifts: 1,
    singleLifts: 0,
    otherLifts: 0,
    liftCapacity: null,
    weekdayOpen: null,
    weekdayClose: null,
    weekendOpen: null,
    weekendClose: null,
    timesComment: null,
    website: null,
    skiersPercent: null,
    snowboardersPercent: null,
    sources: [],
    descriptionShort: null,
    descriptionLong: null,
    outlineImages: [],
    condition: null,
    status: null,
    review: null,
  });
  const { nameRuby: _ruby, formerNames: _former, ...scalars } = data;
  // Disposable test cluster only. Repeat runs start with no retained test state.
  await db.$executeRawUnsafe(
    "TRUNCATE edit_request_jobs, edit_request_events, edit_requests, users, ski_resorts, data_documents, canonical_data_migrations, map_lifts, map_courses, map_course_groups, map_document_states, map_document_backups CASCADE",
  );
  for (const [id, role] of [
    ["integration-admin", "admin"],
    ["integration-editor", "editor"],
    ["integration-other", "editor"],
    ["integration-viewer", "viewer"],
  ])
    await db.user.create({
      data: { id, role, name: id, email: `${id}@example.invalid` },
    });
  await db.skiResort.create({ data: { id: testId, ...scalars } });
  const linkInput = (
    url: string,
    expectedLinks: Array<{ url: string }> = [],
  ) => ({
    resortId: testId,
    platform: "officialSiteUrls",
    links: [{ url }],
    expectedLinks,
  });
  let requestId: string;
  try {
    await t.test(
      "editor submission does not mutate canonical data or expose users / another editor's request",
      async () => {
        const result = (await actor("integration-editor", () =>
          api.saveResortLink(linkInput("https://example.invalid/submitted")),
        )) as { ok: boolean; submission: { requestId: string } };
        assert.equal(result.ok, true);
        requestId = result.submission.requestId;
        assert.equal(await db.dataDocument.count(), 0);
        assert.equal(
          (await db.editRequest.findUnique({ where: { id: requestId } }))
            .status,
          "PENDING",
        );
        await assert.rejects(
          actor("integration-editor", () => api.getAdminDashboardData()),
        );
        await assert.rejects(
          actor("integration-editor", () =>
            api.updateUserRole("integration-other", "admin"),
          ),
        );
        await assert.rejects(
          actor("integration-editor", () =>
            api.deleteUser("integration-other"),
          ),
        );
        await assert.rejects(
          actor("integration-editor", () => api.requireAdminPage()),
          /REDIRECT:\/admin\/no-access/,
        );
        await assert.rejects(
          actor("integration-other", () => api.getEditRequest(requestId)),
        );
        assert.equal(
          (
            (await actor("integration-other", () =>
              api.listEditRequests(),
            )) as { requests: unknown[] }
          ).requests.length,
          0,
        );
        const own = await actor("integration-editor", () =>
          api.getEditRequest(requestId),
        );
        assert.equal(JSON.stringify(own).includes("@example.invalid"), false);
        assert.equal(
          (own as { candidatePayload: unknown }).candidatePayload,
          null,
        );
        assert.equal((own as { submittedPlan: unknown }).submittedPlan, null);
        assert.equal(
          (
            (await actor("integration-editor", () =>
              api.approveEditRequest(requestId, 1),
            )) as { ok: boolean }
          ).ok,
          false,
        );
        assert.equal(
          (
            (await actor("integration-editor", () =>
              api.saveRequestCandidate(
                requestId,
                1,
                linkInput("https://example.invalid/forged"),
                "",
              ),
            )) as { ok: boolean }
          ).ok,
          false,
        );
      },
    );
    await t.test(
      "administrator correction is saved separately, then only the corrected data is applied once",
      async () => {
        const revised = (await actor("integration-admin", () =>
          api.saveRequestCandidate(
            requestId,
            1,
            linkInput("https://example.invalid/corrected"),
            "URLを修正しました。",
          ),
        )) as { ok: boolean; version: number };
        assert.equal(revised.ok, true);
        assert.equal(await db.dataDocument.count(), 0);
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(requestId, 1),
            )) as { ok: boolean }
          ).ok,
          false,
        );
        const results = (await Promise.all(
          [1, 2].map(() =>
            actor("integration-admin", () =>
              api.approveEditRequest(requestId, revised.version),
            ),
          ),
        )) as Array<{ ok: boolean }>;
        assert.equal(results.filter(result => result.ok).length, 1);
        const stored = await db.dataDocument.findUnique({
          where: { key: "SkiResortLinks.json" },
        });
        assert.equal(stored.version, 1);
        assert.equal(
          JSON.parse(stored.content)[testId].officialSiteUrls[0].url,
          "https://example.invalid/corrected",
        );
        const request = await db.editRequest.findUnique({
          where: { id: requestId },
        });
        assert.equal(request.status, "APPLIED");
        assert.equal(
          request.submittedPayload.links[0].url,
          "https://example.invalid/submitted",
        );
        assert.equal(
          request.candidatePayload.links[0].url,
          "https://example.invalid/corrected",
        );
        assert.equal(
          await db.editRequestEvent.count({
            where: { requestId, action: "APPLIED" },
          }),
          1,
        );
      },
    );
    await t.test(
      "canonical-data changes block approval without overwriting newer data",
      async () => {
        const prior = "https://example.invalid/corrected";
        const result = (await actor("integration-editor", () =>
          api.saveResortLink(
            linkInput("https://example.invalid/stale", [{ url: prior }]),
          ),
        )) as { submission: { requestId: string } };
        await actor("integration-admin", () =>
          api.saveResortLink(
            linkInput("https://example.invalid/newer", [{ url: prior }]),
          ),
        );
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(result.submission.requestId, 1),
            )) as { ok: boolean }
          ).ok,
          false,
        );
        assert.equal(
          JSON.parse(
            (
              await db.dataDocument.findUnique({
                where: { key: "SkiResortLinks.json" },
              })
            ).content,
          )[testId].officialSiteUrls[0].url,
          "https://example.invalid/newer",
        );
        assert.equal(
          (
            await db.editRequest.findUnique({
              where: { id: result.submission.requestId },
            })
          ).status,
          "CONFLICT",
        );
      },
    );
    await t.test(
      "a failed audit insert rolls back both request state and canonical writes",
      async () => {
        const result = (await actor("integration-editor", () =>
          api.saveResortLink(
            linkInput("https://example.invalid/rollback", [
              { url: "https://example.invalid/newer" },
            ]),
          ),
        )) as { submission: { requestId: string } };
        await db.$executeRawUnsafe(
          "CREATE FUNCTION fail_editor_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'APPLIED' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$",
        );
        await db.$executeRawUnsafe(
          "CREATE TRIGGER fail_editor_audit BEFORE INSERT ON edit_request_events FOR EACH ROW EXECUTE FUNCTION fail_editor_audit()",
        );
        try {
          assert.equal(
            (
              (await actor("integration-admin", () =>
                api.approveEditRequest(result.submission.requestId, 1),
              )) as { ok: boolean }
            ).ok,
            false,
          );
          assert.equal(
            (
              await db.editRequest.findUnique({
                where: { id: result.submission.requestId },
              })
            ).status,
            "PENDING",
          );
          assert.equal(
            JSON.parse(
              (
                await db.dataDocument.findUnique({
                  where: { key: "SkiResortLinks.json" },
                })
              ).content,
            )[testId].officialSiteUrls[0].url,
            "https://example.invalid/newer",
          );
        } finally {
          await db.$executeRawUnsafe(
            "DROP TRIGGER fail_editor_audit ON edit_request_events",
          );
          await db.$executeRawUnsafe("DROP FUNCTION fail_editor_audit()");
        }
      },
    );
    await t.test(
      "approval racing withdrawal has exactly one winning transition",
      async () => {
        const result = (await actor("integration-editor", () =>
          api.saveResortLink(
            linkInput("https://example.invalid/race", [
              { url: "https://example.invalid/newer" },
            ]),
          ),
        )) as { submission: { requestId: string } };
        const id = result.submission.requestId;
        const results = (await Promise.all([
          actor("integration-admin", () => api.approveEditRequest(id, 1)),
          actor("integration-editor", () => api.withdrawEditRequest(id, 1)),
        ])) as Array<{ ok: boolean }>;
        assert.equal(results.filter(value => value.ok).length, 1);
        const status = (await db.editRequest.findUnique({ where: { id } }))
          .status;
        assert.ok(["APPLIED", "WITHDRAWN"].includes(status));
        assert.equal(
          await db.editRequestEvent.count({
            where: { requestId: id, action: { in: ["APPLIED", "WITHDRAWN"] } },
          }),
          1,
        );
      },
    );
    await t.test(
      "DB downgrade takes effect even when the mocked JWT still says admin",
      async () => {
        await db.user.update({
          where: { id: "integration-editor" },
          data: { role: "viewer" },
        });
        await assert.rejects(
          actor("integration-editor", () =>
            api.saveResortLink(linkInput("https://example.invalid/denied")),
          ),
        );
        await assert.rejects(
          actor("integration-editor", () => api.getEditRequest(requestId)),
        );
        await assert.rejects(
          actor("integration-editor", () => api.requireEditingPage()),
          /REDIRECT:\/admin\/no-access/,
        );
        await db.user.update({
          where: { id: "integration-editor" },
          data: { role: "editor" },
        });
        await assert.rejects(actor(null, () => api.requireEditor()));
        await assert.rejects(
          actor("integration-viewer", () => api.requireAdmin()),
        );
      },
    );
    await t.test(
      "rejection, withdrawal ownership and deleted submitter all preserve history",
      async () => {
        const links = JSON.parse(
          (
            await db.dataDocument.findUnique({
              where: { key: "SkiResortLinks.json" },
            })
          ).content,
        )[testId].officialSiteUrls;
        const result = (await actor("integration-editor", () =>
          api.saveResortLink(
            linkInput("https://example.invalid/reject", links),
          ),
        )) as { submission: { requestId: string } };
        const id = result.submission.requestId;
        assert.equal(
          (
            (await actor("integration-other", () =>
              api.withdrawEditRequest(id, 1),
            )) as { ok: boolean }
          ).ok,
          false,
        );
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.rejectEditRequest(id, 1, ""),
            )) as { ok: boolean }
          ).ok,
          false,
        );
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.rejectEditRequest(id, 1, "出典を確認してください。"),
            )) as { ok: boolean }
          ).ok,
          true,
        );
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(id, 2),
            )) as { ok: boolean }
          ).ok,
          false,
        );
        const other = (await actor("integration-other", () =>
          api.saveResortLink(
            linkInput("https://example.invalid/deleted", links),
          ),
        )) as { submission: { requestId: string } };
        await db.user.delete({ where: { id: "integration-other" } });
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(other.submission.requestId, 1),
            )) as { ok: boolean }
          ).ok,
          false,
        );
        assert.equal(
          await db.editRequestEvent.count({
            where: { requestId: other.submission.requestId },
          }),
          1,
        );
      },
    );
    await t.test(
      "lift geometry and related links stay unpublished until atomic approval",
      async () => {
        const input = {
          resortId: testId,
          fileHash: null,
          lifts: [
            {
              targetSkiId: testId,
              properties: { name: "テストリフト", aerialway: "chair_lift" },
              coordinates: [
                [140, 43],
                [140.01, 43.01],
              ],
            },
          ],
          linkRequests: [
            {
              resortId: testId,
              platform: "mapUrls",
              links: [{ url: "https://example.invalid/map.png" }],
              expectedLinks: [],
            },
          ],
        };
        const result = (await actor("integration-editor", () =>
          api.saveLiftEdits(input),
        )) as {
          ok: boolean;
          errors?: string[];
          submission: { requestId: string };
        };
        assert.equal(result.ok, true, result.errors?.join("\n") ?? "");
        assert.equal(
          await db.dataDocument.count({
            where: { key: { contains: "lift_before/" } },
          }),
          0,
        );
        assert.equal(await db.editRequestJob.count(), 0);
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(result.submission.requestId, 1),
            )) as { ok: boolean }
          ).ok,
          true,
        );
        assert.equal(
          await db.dataDocument.count({
            where: { key: { contains: "lift_before/" } },
          }),
          1,
        );
        assert.equal(
          await db.editRequestJob.count({
            where: {
              requestId: result.submission.requestId,
              status: "PENDING",
            },
          }),
          1,
        );
        const links = JSON.parse(
          (
            await db.dataDocument.findUnique({
              where: { key: "SkiResortLinks.json" },
            })
          ).content,
        );
        assert.equal(
          links[testId].mapUrls[0].url,
          "https://example.invalid/map.png",
        );
      },
    );
    await t.test(
      "slope edits and order changes use the same approval boundary",
      async () => {
        const input = {
          resortId: testId,
          sourceKind: "osm",
          fileHash: null,
          detailFileHash: null,
          courses: [
            {
              targetSkiId: testId,
              properties: { name: "コースA", "@id": "way/1" },
              coordinates: [
                [140, 43],
                [140.01, 43.01],
              ],
              detail: {},
            },
          ],
          preservedFeatures: [],
          preservedDetails: [],
        };
        const result = (await actor("integration-editor", () =>
          api.saveSlopeEdits(input),
        )) as {
          ok: boolean;
          errors?: string[];
          submission: { requestId: string };
        };
        assert.equal(result.ok, true, result.errors?.join("\n") ?? "");
        assert.equal(
          await db.dataDocument.count({
            where: { key: { contains: "slope_before_osm/" } },
          }),
          0,
        );
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(result.submission.requestId, 1),
            )) as { ok: boolean }
          ).ok,
          true,
        );
        const before = await db.dataDocument.findUnique({
          where: {
            key: `resorts-temporary/slope_before_osm/${testId}.geojson`,
          },
        });
        const ordered = (await actor("integration-editor", () =>
          api.applySlopeFeatureOrder({
            resortId: testId,
            sourceKind: "osm",
            fileHash: before.hash,
            orderedGeojsonNames: ["コースA"],
          }),
        )) as { ok: boolean; submission: { requestId: string } };
        assert.equal(ordered.ok, true);
        assert.ok(ordered.submission.requestId);
        assert.equal(
          (await db.dataDocument.findUnique({ where: { key: before.key } }))
            .version,
          before.version,
        );
        await assert.rejects(
          actor("integration-editor", () =>
            api.setOsmSlopeConfirmed(testId, true),
          ),
        );
        await assert.rejects(
          actor("integration-editor", () =>
            api.refreshSlopeElevations(testId, "osm"),
          ),
        );
      },
    );
    await t.test(
      "review import and form edits are both proposals, including administrator corrections",
      async () => {
        const content = {
          resortId: testId,
          detail: {
            resortId: testId,
            research: { date: "2026-10-02", note: "" },
            ...Object.fromEntries(
              api.REVIEW_CATEGORY_IDS.map((id: string) => [
                id,
                { good: [], bad: [], courses: [] },
              ]),
            ),
          },
          article: {
            resortId: testId,
            full: "提出した記事",
            ...Object.fromEntries(
              api.REVIEW_CATEGORY_IDS.map((id: string) => [
                id,
                { score: null, good: "", bad: "", courses: [] },
              ]),
            ),
          },
        };
        const result = (await actor("integration-editor", () =>
          api.publishReviewUpload({
            content,
            expectedHashes: { detail: null, article: null },
          }),
        )) as { ok: boolean; submission: { requestId: string } };
        assert.equal(result.ok, true);
        assert.equal(
          await db.dataDocument.count({
            where: { key: { startsWith: "reviews/" } },
          }),
          0,
        );
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(result.submission.requestId, 1),
            )) as { ok: boolean }
          ).ok,
          true,
        );
        const edit = (await actor("integration-editor", () =>
          api.loadReviewForEdit(testId),
        )) as {
          fileHash: string;
          article: Record<string, unknown>;
          detail: Record<string, unknown>;
        };
        const form = (await actor("integration-editor", () =>
          api.saveReviewFiles({
            resortId: testId,
            ...edit,
            article: { ...edit.article, full: "編集者の変更" },
          }),
        )) as { ok: boolean; submission: { requestId: string } };
        assert.equal(form.ok, true);
        const corrected = (await actor("integration-admin", () =>
          api.saveRequestCandidate(
            form.submission.requestId,
            1,
            {
              resortId: testId,
              ...edit,
              article: { ...edit.article, full: "管理者が修正した記事" },
            },
            "",
          ),
        )) as { ok: boolean; version: number; error?: string };
        assert.equal(corrected.ok, true, corrected.error ?? "");
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(
                form.submission.requestId,
                corrected.version,
              ),
            )) as { ok: boolean }
          ).ok,
          true,
        );
        assert.equal(
          JSON.parse(
            (
              await db.dataDocument.findUnique({
                where: { key: `reviews/${testId}/article.json` },
              })
            ).content,
          ).full,
          "管理者が修正した記事",
        );
      },
    );
    await t.test(
      "resort master changes use the original timestamp and apply corrected fields",
      async () => {
        const before = (
          (await actor("integration-admin", () =>
            api.readAdminSkiResorts(),
          )) as Array<{ id: string; updatedAt: string }>
        ).find(row => row.id === testId);
        assert.ok(before);
        const payload = {
          id: testId,
          request: {
            expectedUpdatedAt: before.updatedAt,
            data: { ...data, nameJa: "申請した名称" },
          },
        };
        const result = (await actor("integration-editor", () =>
          api.runEdit("resort", testId, payload, async () => {
            const updated = await api.updateAdminSkiResort(
              testId,
              payload.request,
            );
            return { status: updated.status === "updated" ? "saved" : "error" };
          }),
        )) as { submission: { requestId: string } };
        assert.equal(
          (await db.skiResort.findUnique({ where: { id: testId } })).nameJa,
          data.nameJa,
        );
        const corrected = (await actor("integration-admin", () =>
          api.saveRequestCandidate(
            result.submission.requestId,
            1,
            {
              ...payload,
              request: {
                ...payload.request,
                data: { ...payload.request.data, nameJa: "修正した名称" },
              },
            },
            "",
          ),
        )) as { ok: boolean; version: number; error?: string };
        assert.equal(corrected.ok, true, corrected.error ?? "");
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(
                result.submission.requestId,
                corrected.version,
              ),
            )) as { ok: boolean }
          ).ok,
          true,
        );
        assert.equal(
          (await db.skiResort.findUnique({ where: { id: testId } })).nameJa,
          "修正した名称",
        );
      },
    );
    await t.test(
      "ticket proposals run the existing validators and check the season version on approval",
      async () => {
        const ticket = JSON.parse(
          await fs.readFile(
            "src/private/data/lift-ticket/rusutsu-resort/2026-2027.json",
            "utf8",
          ),
        );
        const resortId = ticket.resort.id,
          seasonId = ticket.season.id;
        await db.skiResort.create({ data: { id: resortId, ...scalars } });
        await db.liftTicketSeason.create({
          data: {
            skiResortId: resortId,
            seasonId,
            status: ticket.data_quality.status,
            data: ticket,
          },
        });
        const edited = structuredClone(ticket);
        edited.season.notes_ja = "申請した注記";
        const result = (await actor("integration-editor", () =>
          api.saveTicketFile({
            resortId,
            seasonId,
            data: edited,
            baseVersion: 1,
          }),
        )) as {
          ok: boolean;
          errors?: string[];
          submission: { requestId: string };
        };
        assert.equal(result.ok, true, result.errors?.join("\n") ?? "");
        assert.equal(
          (
            await db.liftTicketSeason.findUnique({
              where: {
                skiResortId_seasonId: { skiResortId: resortId, seasonId },
              },
            })
          ).version,
          1,
        );
        const corrected = structuredClone(edited);
        corrected.season.notes_ja = "管理者が確認した注記";
        const review = (await actor("integration-admin", () =>
          api.saveRequestCandidate(
            result.submission.requestId,
            1,
            { resortId, seasonId, data: corrected, baseVersion: 1 },
            "",
          ),
        )) as { ok: boolean; version: number; error?: string };
        assert.equal(review.ok, true, review.error ?? "");
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(
                result.submission.requestId,
                review.version,
              ),
            )) as { ok: boolean }
          ).ok,
          true,
        );
        const stored = await db.liftTicketSeason.findUnique({
          where: { skiResortId_seasonId: { skiResortId: resortId, seasonId } },
        });
        assert.equal(stored.version, 2);
        assert.equal(stored.data.season.notes_ja, "管理者が確認した注記");
        const stale = (await actor("integration-editor", () =>
          api.saveTicketFile({
            resortId,
            seasonId,
            data: corrected,
            baseVersion: 2,
          }),
        )) as { ok: boolean; submission: { requestId: string } };
        assert.equal(stale.ok, true);
        await db.liftTicketSeason.update({
          where: { skiResortId_seasonId: { skiResortId: resortId, seasonId } },
          data: { version: { increment: 1 } },
        });
        assert.equal(
          (
            (await actor("integration-admin", () =>
              api.approveEditRequest(stale.submission.requestId, 1),
            )) as { ok: boolean }
          ).ok,
          false,
        );
      },
    );
    await t.test(
      "status-name mapping remains a proposal until approval",
      async () => {
        const observedAt = new Date("2026-10-02T00:00:00.000Z");
        const run = await db.crawlLatestRun.create({
          data: {
            producerId: "editor-integration",
            idempotencyKey: "mapping",
            skiResortId: testId,
            observedAt,
            completedAt: observedAt,
            schemaVersion: 1,
            rawPayload: {},
            requestHash: "a".repeat(64),
            outcome: "SUCCESS",
          },
        });
        const snapshot = await db.crawlLatestCategorySnapshot.create({
          data: {
            runId: run.id,
            skiResortId: testId,
            kind: "LIFTS",
            state: "SUCCESS",
            validationState: "VALID",
            eligibleForCurrent: true,
            data: [{ name: "公式リフト名", status: "open" }],
            sourceUrls: [],
            itemCount: 1,
            usableItemCount: 1,
          },
        });
        await db.crawlLatestCurrent.create({
          data: { skiResortId: testId, kind: "LIFTS", snapshotId: snapshot.id },
        });
        const workspace = (await actor("integration-editor", () =>
          api.loadLatestStatusMapping(testId, "lifts"),
        )) as { latestFile: string };
        const payload = {
          resortId: testId,
          kind: "lifts",
          latestFile: workspace.latestFile,
          mappingFileHash: null,
          rows: [{ crawledName: "公式リフト名", geojsonName: "テストリフト" }],
        };
        const result = (await actor("integration-editor", () =>
          api.saveLatestStatusMapping(payload),
        )) as {
          ok: boolean;
          errors?: string[];
          submission: { requestId: string };
        };
        assert.equal(result.ok, true, result.errors?.join("\n") ?? "");
        const key = `resorts-temporary/latest_status_mapping/${testId}.json`;
        assert.equal(
          await db.dataDocument.findUnique({ where: { key } }),
          null,
        );
        const corrected = (await actor("integration-admin", () =>
          api.saveRequestCandidate(
            result.submission.requestId,
            1,
            {
              ...payload,
              rows: [{ crawledName: null, geojsonName: "テストリフト" }],
            },
            "",
          ),
        )) as { ok: boolean; error?: string; version: number };
        assert.equal(corrected.ok, true, corrected.error ?? "");
        const applied = (await actor("integration-admin", () =>
          api.approveEditRequest(
            result.submission.requestId,
            corrected.version,
          ),
        )) as { ok: boolean; error?: string };
        assert.equal(applied.ok, true, applied.error ?? "");
        assert.equal(
          JSON.parse(
            (await db.dataDocument.findUnique({ where: { key } })).content,
          ).lifts.rows[0].crawledName,
          null,
        );
      },
    );
    await t.test(
      "approval also commits the enabled relational map projection",
      async () => {
        const resortId = "integration-relational";
        await db.skiResort.create({ data: { id: resortId, ...scalars } });
        await db.canonicalDataMigration.create({
          data: {
            key: "map-entities-v1",
            sourceHash: "a".repeat(64),
            details: {},
          },
        });
        try {
          const result = (await actor("integration-editor", () =>
            api.saveLiftEdits({
              resortId,
              fileHash: null,
              lifts: [
                {
                  targetSkiId: resortId,
                  properties: {
                    name: "関係テーブル検証リフト",
                    entityId: "editor-relational-lift",
                    aerialway: "chair_lift",
                  },
                  coordinates: [
                    [140, 43],
                    [140.01, 43.01],
                  ],
                },
              ],
            }),
          )) as {
            ok: boolean;
            errors?: string[];
            submission: { requestId: string };
          };
          assert.equal(result.ok, true, result.errors?.join("\n") ?? "");
          assert.equal(await db.mapLift.count({ where: { resortId } }), 0);
          const applied = (await actor("integration-admin", () =>
            api.approveEditRequest(result.submission.requestId, 1),
          )) as { ok: boolean; error?: string };
          assert.equal(applied.ok, true, applied.error ?? "");
          assert.equal(
            await db.mapLift.count({ where: { resortId, archivedAt: null } }),
            1,
          );
        } finally {
          await db.canonicalDataMigration.delete({
            where: { key: "map-entities-v1" },
          });
        }
      },
    );
    await t.test(
      "localhost uses the canonical API with Google identity, server roles and atomic approval across separate databases",
      async () => {
        await verifyRemoteWorkflow(api, actor, data, root);
      },
    );
  } finally {
    await api.disconnectPrisma();
  }
});
