import { promises as fs } from "node:fs";
import path from "node:path";

export type LatestStatusKind = "courses" | "lifts";

export type LatestSuccessfulStatus = {
  fileName: string;
  time: string | null;
  items: Record<string, unknown>[];
  sourceUrls: string[];
};

const TIMESTAMPED_STATUS_FILE_RE =
  /^(\d{4})_(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.json$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const toStringArray = (value: unknown): string[] => {
  if (typeof value === "string") {
    const normalized = normalizeString(value);
    return normalized ? [normalized] : [];
  }
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map(normalizeString)
        .filter((item): item is string => item !== null),
    ),
  ];
};

/**
 * ファイル名に含まれる時刻で新しい順に並べる。
 * clone 後は mtime が揃うため、mtime は使わない。
 */
export const listLatestStatusFiles = (fileNames: string[]): string[] =>
  fileNames
    .filter(fileName => TIMESTAMPED_STATUS_FILE_RE.test(fileName))
    .sort()
    .reverse();

export const selectLatestStatusFile = (fileNames: string[]): string | null =>
  listLatestStatusFiles(fileNames)[0] ?? null;

/**
 * courses / lifts ごとに、名前付きデータを1件以上取得できた最新JSONまで
 * 新しい順にさかのぼる。壊れたJSONや対象配列が空のファイルは読み飛ばす。
 */
export const loadLatestSuccessfulStatus = async (
  temporaryRoot: string,
  resortId: string,
  kind: LatestStatusKind,
): Promise<LatestSuccessfulStatus | null> => {
  const directory = path.resolve(temporaryRoot, "latest_data", resortId);
  let fileNames: string[];
  try {
    fileNames = await fs.readdir(directory);
  } catch {
    return null;
  }

  for (const fileName of listLatestStatusFiles(fileNames)) {
    try {
      const raw = await fs.readFile(path.join(directory, fileName), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed[kind])) continue;

      const items = parsed[kind].filter(
        (item): item is Record<string, unknown> =>
          isRecord(item) && normalizeString(item.name) !== null,
      );
      if (items.length === 0) continue;

      return {
        fileName,
        time: normalizeString(parsed.time),
        items,
        sourceUrls: toStringArray(
          parsed[kind === "courses" ? "courseUrl" : "liftUrl"],
        ),
      };
    } catch {
      // 取得失敗・不完全なJSONは、その一つ前を試す。
    }
  }

  return null;
};

/**
 * latest_data 配下のスキー場のうち、courses / lifts それぞれで
 * 「名前付きデータを1件以上取得できている」ものの ID を集める。
 *
 * クローラー自体は存在してもコース情報を取れていないスキー場があるので、
 * ディレクトリの有無ではなく中身で判定する。新しいファイルから順に見て、
 * courses と lifts の両方が決まった時点でそのスキー場は打ち切る。
 */
export const listResortIdsWithLatestStatus = async (
  temporaryRoot: string,
): Promise<Record<LatestStatusKind, Set<string>>> => {
  const root = path.resolve(temporaryRoot, "latest_data");
  let resortIds: string[];
  try {
    resortIds = (await fs.readdir(root, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return { courses: new Set(), lifts: new Set() };
  }

  const result: Record<LatestStatusKind, Set<string>> = {
    courses: new Set(),
    lifts: new Set(),
  };

  await Promise.all(
    resortIds.map(async resortId => {
      const directory = path.join(root, resortId);
      let fileNames: string[];
      try {
        fileNames = await fs.readdir(directory);
      } catch {
        return;
      }

      const pending = new Set<LatestStatusKind>(["courses", "lifts"]);
      for (const fileName of listLatestStatusFiles(fileNames)) {
        if (pending.size === 0) break;
        let parsed: unknown;
        try {
          parsed = JSON.parse(
            await fs.readFile(path.join(directory, fileName), "utf8"),
          );
        } catch {
          continue;
        }
        if (!isRecord(parsed)) continue;
        for (const kind of [...pending]) {
          const items = parsed[kind];
          if (!Array.isArray(items)) continue;
          const hasNamed = items.some(
            item => isRecord(item) && normalizeString(item.name) !== null,
          );
          if (!hasNamed) continue;
          result[kind].add(resortId);
          pending.delete(kind);
        }
      }
    }),
  );

  return result;
};
