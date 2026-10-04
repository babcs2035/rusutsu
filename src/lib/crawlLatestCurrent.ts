import "server-only";

import {
  fetchInternalDataApi,
  InternalDataApiError,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import type {
  LatestStatusKind,
  LatestSuccessfulStatus,
} from "@/lib/latestStatusFiles";
import {
  combineLatestStatuses,
  combineLinkedMappingCaptures,
  withLinkedAreaIds,
} from "@/lib/linkedAreaStatus";
import {
  findAvailableCrawlLatestStatusDirect,
  listAvailableCrawlLatestResortIdsDirect,
} from "@/server/crawl-latest/availableStatus";

const parseObjectEnvelope = async <T>(
  response: Response,
  key: string,
): Promise<T> => {
  const value = (await response.json()) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("正本データAPIの応答形式が不正です。");
  }
  const record = value as Record<string, unknown>;
  if (!(key in record)) {
    throw new Error(`正本データAPIの応答に ${key} がありません。`);
  }
  return record[key] as T;
};

const readLinkedAreaList = async () => {
  const { readLinkedAreas } = await import("./skiResortData");
  return readLinkedAreas();
};

/** 連携エリアの親なら所属スキー場のID。親でなければ null。 */
const linkedMemberIds = async (resortId: string) => {
  const area = (await readLinkedAreaList()).find(item => item.id === resortId);
  return area?.memberIds.length ? area.memberIds : null;
};

/** 同名のコース・リフトを区別するための、所属スキー場の名前。 */
const memberLabels = async (memberIds: string[]) => {
  const { readSkiResortNames } = await import("./skiResortData");
  const names = new Map(
    (await readSkiResortNames(memberIds)).map(item => [item.id, item.nameJa]),
  );
  return memberIds.map(id => names.get(id) ?? id);
};

/** 連携エリアの親は、所属スキー場の取得結果をまとめて読む。 */
const readForResortOrArea = async (
  resortId: string,
  read: (id: string) => Promise<LatestSuccessfulStatus | null>,
) => {
  const memberIds = await linkedMemberIds(resortId);
  if (!memberIds) return read(resortId);
  const [statuses, labels] = await Promise.all([
    Promise.all(memberIds.map(read)),
    memberLabels(memberIds),
  ]);
  return combineLatestStatuses(statuses, labels);
};

export function readCurrentCrawlLatestStatus(
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus | null> {
  return readForResortOrArea(resortId, id =>
    readOwnCurrentCrawlLatestStatus(id, kind),
  );
}

async function readOwnCurrentCrawlLatestStatus(
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus | null> {
  if (!usesRemoteDataApi()) {
    return findAvailableCrawlLatestStatusDirect(resortId, kind);
  }
  const search = new URLSearchParams({ resortId, kind, view: "status" });
  const response = await fetchInternalDataApi(
    `/api/internal/v1/crawl-latest-current?${search.toString()}`,
  );
  return parseObjectEnvelope<LatestSuccessfulStatus | null>(response, "status");
}

export async function listCurrentCrawlLatestResortIds(
  kind: LatestStatusKind,
): Promise<string[]> {
  const [ids, areas] = await Promise.all([
    listOwnCurrentCrawlLatestResortIds(kind),
    readLinkedAreaList(),
  ]);
  return withLinkedAreaIds(ids, areas);
}

async function listOwnCurrentCrawlLatestResortIds(
  kind: LatestStatusKind,
): Promise<string[]> {
  if (!usesRemoteDataApi()) {
    return listAvailableCrawlLatestResortIdsDirect(kind);
  }
  const search = new URLSearchParams({ kind, view: "resortIds" });
  const response = await fetchInternalDataApi(
    `/api/internal/v1/crawl-latest-current?${search.toString()}`,
  );
  return parseObjectEnvelope<string[]>(response, "resortIds");
}

/** 名称対応付け専用。Wayback検証結果へのフォールバックを許可する。 */
export function readMappingCrawlLatestStatus(
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus | null> {
  return readLinkedMappingCaptures(resortId, kind).then(captures =>
    captures
      ? captures.status
      : readOwnMappingCrawlLatestStatus(resortId, kind),
  );
}

/** 連携エリアの親なら、所属スキー場ごとの採用済み結果と履歴をまとめる。 */
async function readLinkedMappingCaptures(
  resortId: string,
  kind: LatestStatusKind,
) {
  const memberIds = await linkedMemberIds(resortId);
  if (!memberIds) return null;
  const [members, labels] = await Promise.all([
    Promise.all(
      memberIds.map(async id => {
        const [status, history] = await Promise.all([
          readOwnMappingCrawlLatestStatus(id, kind),
          readOwnMappingStatusHistory(id, kind),
        ]);
        return { status, history };
      }),
    ),
    memberLabels(memberIds),
  ]);
  return combineLinkedMappingCaptures(
    members.map((member, index) => ({ ...member, label: labels[index] })),
  );
}

async function readOwnMappingCrawlLatestStatus(
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus | null> {
  if (!usesRemoteDataApi())
    return findAvailableCrawlLatestStatusDirect(
      resortId,
      kind,
      undefined,
      undefined,
      true,
    );
  const search = new URLSearchParams({ resortId, kind, view: "mappingStatus" });
  const response = await fetchInternalDataApi(
    `/api/internal/v1/crawl-latest-current?${search}`,
  );
  return parseObjectEnvelope(response, "status");
}

export async function listMappingCrawlLatestResortIds(
  kind: LatestStatusKind,
): Promise<string[]> {
  const [ids, areas] = await Promise.all([
    listOwnMappingCrawlLatestResortIds(kind),
    readLinkedAreaList(),
  ]);
  return withLinkedAreaIds(ids, areas);
}

async function listOwnMappingCrawlLatestResortIds(
  kind: LatestStatusKind,
): Promise<string[]> {
  if (!usesRemoteDataApi())
    return listAvailableCrawlLatestResortIdsDirect(
      kind,
      undefined,
      undefined,
      true,
    );
  const search = new URLSearchParams({ kind, view: "mappingResortIds" });
  const response = await fetchInternalDataApi(
    `/api/internal/v1/crawl-latest-current?${search}`,
  );
  return parseObjectEnvelope(response, "resortIds");
}

export async function readCurrentResortConditions(
  resortId: string,
): Promise<
  import("@/features/resort-detail/utils/currentConditions").ResortConditions
> {
  if (!usesRemoteDataApi()) {
    const { readAvailableConditions } = await import(
      "@/server/crawl-latest/conditions"
    );
    return readAvailableConditions(resortId);
  }
  const search = new URLSearchParams({
    resortId,
    kind: "courses",
    view: "conditions",
  });
  try {
    const response = await fetchInternalDataApi(
      `/api/internal/v1/crawl-latest-current?${search}`,
    );
    return parseObjectEnvelope(response, "conditions");
  } catch (error) {
    // Allow the web app and data API to be deployed separately. Historical
    // captures retain their original source URLs, timestamp and archive label.
    if (
      !(error instanceof InternalDataApiError) ||
      ![400, 404].includes(error.status ?? 0)
    )
      throw error;
    const { readBundledResortConditions } = await import(
      "./bundledResortConditions"
    );
    return readBundledResortConditions(resortId);
  }
}

/** 名称対応用の全パターン。公開の現在値とは独立した読み取り。 */
export async function readMappingStatusHistory(
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus[]> {
  const captures = await readLinkedMappingCaptures(resortId, kind);
  return captures
    ? captures.history
    : readOwnMappingStatusHistory(resortId, kind);
}

async function readOwnMappingStatusHistory(
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus[]> {
  const { loadStatusHistory } = await import("./latestStatusFiles");
  const { default: path } = await import("node:path");
  const bundled = await loadStatusHistory(
    path.join(process.cwd(), "src/private/data/resorts-temporary"),
    resortId,
    kind,
  );
  if (!usesRemoteDataApi()) {
    const { listMappingStatusHistoryDirect } = await import(
      "@/server/crawl-latest/current"
    );
    return [
      ...(await listMappingStatusHistoryDirect(resortId, kind)),
      ...bundled,
    ];
  }
  try {
    const response = await fetchInternalDataApi(
      `/api/internal/v1/crawl-latest-current?${new URLSearchParams({ resortId, kind, view: "mappingHistory" })}`,
    );
    return [
      ...(await parseObjectEnvelope<LatestSuccessfulStatus[]>(
        response,
        "history",
      )),
      ...bundled,
    ];
  } catch (error) {
    if (
      !(error instanceof InternalDataApiError) ||
      ![400, 404].includes(error.status ?? 0)
    )
      throw error;
    // APIの先行デプロイがなくても既存の診断APIで履歴を読める。
    const response = await fetchInternalDataApi(
      `/api/internal/v1/crawl-latest-runs?${new URLSearchParams({ resortId, limit: "100" })}`,
      {},
      { scope: "diagnostics-read" },
    );
    const runs = await parseObjectEnvelope<Array<{ id: string }>>(
      response,
      "runs",
    );
    const captures: LatestSuccessfulStatus[] = [];
    // 接続数を抑えながら履歴を取得する。
    for (let offset = 0; offset < runs.length; offset += 5) {
      const batch = await Promise.all(
        runs.slice(offset, offset + 5).map(async ({ id }) => {
          const detail = await fetchInternalDataApi(
            `/api/internal/v1/crawl-latest-runs?${new URLSearchParams({ runId: id, include: "categoryData" })}`,
            {},
            { scope: "diagnostics-read" },
          );
          const run = await parseObjectEnvelope<{
            observedAt: string;
            archiveTimestamp: string | null;
            categories: Array<{
              id: string;
              kind: string;
              state: string;
              data: unknown;
              sourceUrls: string[];
            }>;
          }>(detail, "run");
          const category = run.categories.find(
            item => item.kind === (kind === "courses" ? "COURSES" : "LIFTS"),
          );
          if (category?.state !== "SUCCESS" || !Array.isArray(category.data))
            return null;
          return {
            fileName: `history-${category.id}.json`,
            time: run.observedAt,
            archiveTimestamp: run.archiveTimestamp,
            items: category.data as Record<string, unknown>[],
            sourceUrls: category.sourceUrls,
          };
        }),
      );
      captures.push(
        ...batch.filter(
          (item): item is NonNullable<typeof item> => item !== null,
        ),
      );
    }
    return [...captures, ...bundled];
  }
}
