import "server-only";

import {
  type CrawlLatestCategoryKind,
  type CrawlLatestSourceMode,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getDataDocumentDirect,
  listDataDocumentsDirect,
} from "@/server/data-documents/repository";
import type {
  CrawlMonitorCategorySummary,
  CrawlMonitorCurrent,
  CrawlMonitorIssueCounts,
  CrawlMonitorIssueListQuery,
  CrawlMonitorIssuePage,
  CrawlMonitorMapping,
  CrawlMonitorMappingGap,
  CrawlMonitorOverview,
  CrawlMonitorRunDetail,
  CrawlMonitorRunListQuery,
  CrawlMonitorRunPage,
  CrawlMonitorRunSummary,
  CrawlMonitorSourceMode,
} from "./adminContract";
import {
  bundledFileNameFromRunId,
  isBundledRunId,
  listBundledFileNames,
  listBundledResortIds,
  listBundledRunSummaries,
  readBundledCurrents,
  readBundledRunDetail,
  readLatestBundledRunSummary,
} from "./bundledRuns";
import {
  buildMappingGaps,
  extractCrawledNames,
  LATEST_STATUS_MAPPING_PREFIX,
  mappingResortIdFromKey,
  parseMappingExpectedNames,
} from "./mappingCoverage";

/**
 * 監視画面のDB直読み実装。
 *
 * 本番appはこのモジュールを直接使い、`DATA_API_BASE_URL` を設定したローカルappは
 * 内部API越しに本番のこの実装を呼ぶ（adminClient.ts）。
 */

const EMPTY_ISSUE_COUNTS: CrawlMonitorIssueCounts = {
  warning: 0,
  error: 0,
  blocking: 0,
};

const categorySummarySelect = {
  runId: true,
  kind: true,
  state: true,
  validationState: true,
  eligibleForCurrent: true,
  itemCount: true,
  usableItemCount: true,
  contentHash: true,
  nameSetHash: true,
} satisfies Prisma.CrawlLatestCategorySnapshotSelect;

const CATEGORY_ORDER: Record<CrawlLatestCategoryKind, number> = {
  COMMENT: 0,
  WEATHER: 1,
  COURSES: 2,
  LIFTS: 3,
};

const sortCategories = (
  categories: CrawlMonitorCategorySummary[],
): CrawlMonitorCategorySummary[] =>
  [...categories].sort(
    (left, right) => CATEGORY_ORDER[left.kind] - CATEGORY_ORDER[right.kind],
  );

/** 実行種別の絞り込み。ski場に紐付かない診断run（yuki-magi等）は監視対象外。 */
const runScopeFilter = (sourceModes: readonly CrawlMonitorSourceMode[]) =>
  ({
    skiResortId: { not: null },
    sourceMode: { in: [...sourceModes] as CrawlLatestSourceMode[] },
  }) satisfies Prisma.CrawlLatestRunWhereInput;

type RunRow = {
  id: string;
  skiResortId: string | null;
  observedAt: Date;
  completedAt: Date;
  sourceMode: CrawlLatestSourceMode;
  archiveTimestamp: string | null;
  outcome: "SUCCESS" | "PARTIAL" | "FAILED";
  crawlerFile: string | null;
  crawlerRevision: string | null;
};

const runSummarySelect = {
  id: true,
  skiResortId: true,
  observedAt: true,
  completedAt: true,
  sourceMode: true,
  archiveTimestamp: true,
  outcome: true,
  crawlerFile: true,
  crawlerRevision: true,
} satisfies Prisma.CrawlLatestRunSelect;

const collectRunDecorations = async (runIds: readonly string[]) => {
  if (runIds.length === 0) {
    return {
      categoriesByRun: new Map<string, CrawlMonitorCategorySummary[]>(),
      issueCountsByRun: new Map<string, CrawlMonitorIssueCounts>(),
    };
  }
  const [categories, severityCounts, blockingCounts] = await Promise.all([
    prisma.crawlLatestCategorySnapshot.findMany({
      where: { runId: { in: [...runIds] } },
      select: categorySummarySelect,
    }),
    prisma.crawlLatestIssue.groupBy({
      by: ["runId", "severity"],
      where: { runId: { in: [...runIds] } },
      _count: { _all: true },
    }),
    prisma.crawlLatestIssue.groupBy({
      by: ["runId"],
      where: { runId: { in: [...runIds] }, blocksPromotion: true },
      _count: { _all: true },
    }),
  ]);

  const categoriesByRun = new Map<string, CrawlMonitorCategorySummary[]>();
  for (const { runId, ...category } of categories) {
    const bucket = categoriesByRun.get(runId) ?? [];
    bucket.push(category);
    categoriesByRun.set(runId, bucket);
  }

  const issueCountsByRun = new Map<string, CrawlMonitorIssueCounts>();
  const countsFor = (runId: string) => {
    const existing = issueCountsByRun.get(runId) ?? { ...EMPTY_ISSUE_COUNTS };
    issueCountsByRun.set(runId, existing);
    return existing;
  };
  for (const row of severityCounts) {
    const counts = countsFor(row.runId);
    if (row.severity === "ERROR") counts.error += row._count._all;
    else counts.warning += row._count._all;
  }
  for (const row of blockingCounts) {
    countsFor(row.runId).blocking += row._count._all;
  }

  return { categoriesByRun, issueCountsByRun };
};

const toRunSummary = (
  run: RunRow,
  categoriesByRun: Map<string, CrawlMonitorCategorySummary[]>,
  issueCountsByRun: Map<string, CrawlMonitorIssueCounts>,
): CrawlMonitorRunSummary => ({
  id: run.id,
  resortId: run.skiResortId ?? "",
  origin: "DATABASE",
  observedAt: run.observedAt.toISOString(),
  completedAt: run.completedAt.toISOString(),
  sourceMode: run.sourceMode as CrawlMonitorSourceMode,
  archiveTimestamp: run.archiveTimestamp,
  outcome: run.outcome,
  crawlerFile: run.crawlerFile,
  crawlerRevision: run.crawlerRevision,
  categories: sortCategories(categoriesByRun.get(run.id) ?? []),
  issueCounts: issueCountsByRun.get(run.id) ?? { ...EMPTY_ISSUE_COUNTS },
});

const listMappedResortIds = async (): Promise<string[]> =>
  (await listDataDocumentsDirect(LATEST_STATUS_MAPPING_PREFIX)).flatMap(
    document => {
      const resortId = mappingResortIdFromKey(document.key);
      return resortId ? [resortId] : [];
    },
  );

const readMappingExpectedNames = async (resortId: string) =>
  parseMappingExpectedNames(
    (
      await getDataDocumentDirect(
        `${LATEST_STATUS_MAPPING_PREFIX}${resortId}.json`,
      )
    )?.content ?? null,
  );

/** runが実際に拾った名前を、コース・リフトの2カテゴリ分だけ読む。 */
const crawledNamesByRun = async (
  runIds: readonly string[],
): Promise<Map<string, { COURSES: string[]; LIFTS: string[] }>> => {
  const names = new Map<string, { COURSES: string[]; LIFTS: string[] }>();
  if (runIds.length === 0) return names;
  const snapshots = await prisma.crawlLatestCategorySnapshot.findMany({
    where: { runId: { in: [...runIds] }, kind: { in: ["COURSES", "LIFTS"] } },
    select: { runId: true, kind: true, data: true },
  });
  for (const snapshot of snapshots) {
    const entry = names.get(snapshot.runId) ?? { COURSES: [], LIFTS: [] };
    if (snapshot.kind === "COURSES" || snapshot.kind === "LIFTS") {
      entry[snapshot.kind] = extractCrawledNames(snapshot.data);
    }
    names.set(snapshot.runId, entry);
  }
  return names;
};

export async function fetchCrawlMonitorOverviewDirect(
  sourceModes: readonly CrawlMonitorSourceMode[],
): Promise<CrawlMonitorOverview> {
  // スキー場ごとの最新1件だけを見る。DISTINCT ONで走査を最新行に絞る。
  const latestRuns = await prisma.$queryRaw<RunRow[]>`
    SELECT DISTINCT ON ("skiResortId")
      "id", "skiResortId", "observedAt", "completedAt", "sourceMode",
      "archiveTimestamp", "outcome", "crawlerFile", "crawlerRevision"
    FROM "crawl_latest_runs"
    WHERE "skiResortId" IS NOT NULL
      AND "sourceMode"::text IN (${Prisma.join([...sourceModes])})
    ORDER BY "skiResortId", "observedAt" DESC, "id" DESC
  `;

  const [resorts, decorations] = await Promise.all([
    prisma.skiResort.findMany({
      where: { mergedIntoId: null },
      select: { id: true, nameJa: true, prefecture: true },
      orderBy: { id: "asc" },
    }),
    collectRunDecorations(latestRuns.map(run => run.id)),
  ]);

  const runByResort = new Map(
    latestRuns.flatMap(run =>
      run.skiResortId ? [[run.skiResortId, run]] : [],
    ),
  );

  const rows = resorts.map(resort => {
    const run = runByResort.get(resort.id);
    return {
      resortId: resort.id,
      resortName: resort.nameJa,
      prefecture: resort.prefecture,
      mappingGaps: [] as CrawlMonitorMappingGap[],
      latestRun: run
        ? toRunSummary(
            run,
            decorations.categoriesByRun,
            decorations.issueCountsByRun,
          )
        : null,
    };
  });

  // APIへ送る運用は段階導入中なので、DBに実行記録が無いスキー場はファイルを見る。
  const bundledIds = new Set(await listBundledResortIds());
  await Promise.all(
    rows.map(async row => {
      if (row.latestRun || !bundledIds.has(row.resortId)) return;
      row.latestRun = await readLatestBundledRunSummary(row.resortId);
    }),
  );

  // 対応表があるスキー場だけ、取れるはずの名前と突き合わせる。
  const mappedIds = new Set(await listMappedResortIds());
  const mappedRows = rows.filter(
    row => mappedIds.has(row.resortId) && row.latestRun?.origin === "DATABASE",
  );
  const namesByRun = await crawledNamesByRun(
    mappedRows.flatMap(row => (row.latestRun ? [row.latestRun.id] : [])),
  );
  await Promise.all(
    mappedRows.map(async row => {
      const expected = await readMappingExpectedNames(row.resortId);
      if (!expected || !row.latestRun) return;
      row.mappingGaps = buildMappingGaps(
        expected,
        namesByRun.get(row.latestRun.id) ?? { COURSES: [], LIFTS: [] },
      );
    }),
  );

  return { rows, generatedAt: new Date().toISOString() };
}

export async function fetchCrawlMonitorMappingDirect(
  resortId: string,
): Promise<CrawlMonitorMapping> {
  const expected = await readMappingExpectedNames(resortId);
  if (!expected) return { gaps: [], observedAt: null };

  const run = await prisma.crawlLatestRun.findFirst({
    where: { skiResortId: resortId, sourceMode: "LIVE" },
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    select: { id: true, observedAt: true },
  });
  if (!run) return { gaps: [], observedAt: null };

  const names = await crawledNamesByRun([run.id]);
  return {
    gaps: buildMappingGaps(
      expected,
      names.get(run.id) ?? { COURSES: [], LIFTS: [] },
    ),
    observedAt: run.observedAt.toISOString(),
  };
}

export async function fetchCrawlMonitorRunsDirect(
  query: CrawlMonitorRunListQuery,
): Promise<CrawlMonitorRunPage> {
  if (query.origin === "FILE") {
    const fileNames = await listBundledFileNames(query.resortId);
    const runs = await listBundledRunSummaries(
      query.resortId,
      query.page * query.pageSize,
    );
    return {
      total: fileNames.length,
      runs: runs.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
    };
  }

  const where = {
    ...runScopeFilter(query.sourceModes),
    skiResortId: query.resortId,
  } satisfies Prisma.CrawlLatestRunWhereInput;

  const [total, runs] = await Promise.all([
    prisma.crawlLatestRun.count({ where }),
    prisma.crawlLatestRun.findMany({
      where,
      orderBy: [{ observedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: runSummarySelect,
    }),
  ]);

  const decorations = await collectRunDecorations(runs.map(run => run.id));
  return {
    total,
    runs: runs.map(run =>
      toRunSummary(
        run,
        decorations.categoriesByRun,
        decorations.issueCountsByRun,
      ),
    ),
  };
}

export async function fetchCrawlMonitorCurrentsDirect(
  resortId: string,
): Promise<{ currents: CrawlMonitorCurrent[] }> {
  const rows = await prisma.crawlLatestCurrent.findMany({
    where: { skiResortId: resortId },
    select: {
      kind: true,
      updatedAt: true,
      snapshot: {
        select: {
          id: true,
          runId: true,
          state: true,
          validationState: true,
          itemCount: true,
          usableItemCount: true,
          sourceUrls: true,
          data: true,
          run: { select: { observedAt: true } },
        },
      },
    },
  });

  const currents: CrawlMonitorCurrent[] = rows.map(row => ({
    kind: row.kind,
    origin: "DATABASE" as const,
    runId: row.snapshot.runId,
    snapshotId: row.snapshot.id,
    observedAt: row.snapshot.run.observedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    state: row.snapshot.state,
    validationState: row.snapshot.validationState,
    itemCount: row.snapshot.itemCount,
    usableItemCount: row.snapshot.usableItemCount,
    sourceUrls: row.snapshot.sourceUrls,
    data: row.snapshot.data ?? null,
  }));
  const missing = (["COMMENT", "WEATHER", "COURSES", "LIFTS"] as const).filter(
    kind => !currents.some(current => current.kind === kind),
  );
  if (missing.length > 0) {
    currents.push(...(await readBundledCurrents(resortId, missing)));
  }
  currents.sort(
    (left, right) => CATEGORY_ORDER[left.kind] - CATEGORY_ORDER[right.kind],
  );
  return { currents };
}

export async function fetchCrawlMonitorRunDetailDirect(
  resortId: string,
  runId: string,
): Promise<CrawlMonitorRunDetail | null> {
  if (isBundledRunId(runId)) {
    const fileName = bundledFileNameFromRunId(runId);
    return fileName ? readBundledRunDetail(resortId, fileName) : null;
  }

  const run = await prisma.crawlLatestRun.findUnique({
    where: { id: runId },
    select: {
      ...runSummarySelect,
      producerId: true,
      requestHash: true,
      crawlerSourceHash: true,
      rawPayload: true,
    },
  });
  if (!run || run.skiResortId !== resortId) return null;
  if (run.sourceMode === "LEGACY_IMPORT") return null;

  const [categories, issues, artifacts, decorations] = await Promise.all([
    prisma.crawlLatestCategorySnapshot.findMany({
      where: { runId },
      select: { ...categorySummarySelect, sourceUrls: true, data: true },
    }),
    prisma.crawlLatestIssue.findMany({
      where: { runId },
      orderBy: [{ severity: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        categoryKind: true,
        severity: true,
        code: true,
        message: true,
        occurrences: true,
        blocksPromotion: true,
        details: true,
        createdAt: true,
      },
    }),
    prisma.crawlLatestArtifact.findMany({
      where: { runId },
      orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        categoryKind: true,
        state: true,
        pageKey: true,
        title: true,
        requestedUrl: true,
        finalUrl: true,
        httpStatus: true,
        sizeBytes: true,
        storageKey: true,
        captureError: true,
        capturedAt: true,
      },
    }),
    collectRunDecorations([runId]),
  ]);

  return {
    run: {
      ...toRunSummary(
        run,
        decorations.categoriesByRun,
        decorations.issueCountsByRun,
      ),
      producerId: run.producerId,
      requestHash: run.requestHash,
      crawlerSourceHash: run.crawlerSourceHash,
    },
    categories: categories
      .map(({ runId: _runId, data, ...category }) => ({
        ...category,
        data: data ?? null,
      }))
      .sort(
        (left, right) => CATEGORY_ORDER[left.kind] - CATEGORY_ORDER[right.kind],
      ),
    issues: issues.map(issue => ({
      ...issue,
      details: issue.details ?? null,
      createdAt: issue.createdAt.toISOString(),
    })),
    artifacts: artifacts.map(artifact => ({
      id: artifact.id,
      categoryKind: artifact.categoryKind,
      state: artifact.state,
      pageKey: artifact.pageKey,
      title: artifact.title,
      requestedUrl: artifact.requestedUrl,
      finalUrl: artifact.finalUrl,
      httpStatus: artifact.httpStatus,
      sizeBytes: artifact.sizeBytes?.toString() ?? null,
      captureError: artifact.captureError,
      capturedAt: artifact.capturedAt.toISOString(),
      hasContent:
        artifact.state === "AVAILABLE" && artifact.storageKey !== null,
    })),
    rawPayload: run.rawPayload ?? null,
  };
}

const issueWhere = (
  query: CrawlMonitorIssueListQuery,
): Prisma.CrawlLatestIssueWhereInput => ({
  ...(query.severity ? { severity: query.severity } : {}),
  ...(query.code ? { code: query.code } : {}),
  ...(query.categoryKind ? { categoryKind: query.categoryKind } : {}),
  ...(query.blockingOnly ? { blocksPromotion: true } : {}),
  ...(query.since ? { createdAt: { gte: new Date(query.since) } } : {}),
  run: {
    ...runScopeFilter(query.sourceModes),
    ...(query.resortId ? { skiResortId: query.resortId } : {}),
  },
});

export async function fetchCrawlMonitorIssuesDirect(
  query: CrawlMonitorIssueListQuery,
): Promise<CrawlMonitorIssuePage> {
  const where = issueWhere(query);
  const [total, issues, codes] = await Promise.all([
    prisma.crawlLatestIssue.count({ where }),
    prisma.crawlLatestIssue.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        runId: true,
        categoryKind: true,
        severity: true,
        code: true,
        message: true,
        occurrences: true,
        blocksPromotion: true,
        createdAt: true,
        run: {
          select: {
            skiResortId: true,
            observedAt: true,
            sourceMode: true,
            outcome: true,
            skiResort: { select: { nameJa: true } },
          },
        },
      },
    }),
    prisma.crawlLatestIssue.groupBy({
      by: ["code", "severity"],
      where,
      _count: { _all: true },
      orderBy: { _count: { code: "desc" } },
      take: 30,
    }),
  ]);

  return {
    total,
    issues: issues.map(issue => ({
      id: issue.id,
      runId: issue.runId,
      resortId: issue.run.skiResortId ?? "",
      resortName: issue.run.skiResort?.nameJa ?? issue.run.skiResortId ?? "",
      observedAt: issue.run.observedAt.toISOString(),
      sourceMode: issue.run.sourceMode as CrawlMonitorSourceMode,
      outcome: issue.run.outcome,
      categoryKind: issue.categoryKind,
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      occurrences: issue.occurrences,
      blocksPromotion: issue.blocksPromotion,
      createdAt: issue.createdAt.toISOString(),
    })),
    codes: codes.map(row => ({
      code: row.code,
      severity: row.severity,
      count: row._count._all,
    })),
  };
}
