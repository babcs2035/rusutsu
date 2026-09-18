import type {
  CapabilityConditionsSection,
  CapabilityOperationFields,
  CapabilityOperationSection,
  CapabilitySource,
  CapabilityWeatherFields,
  LatestStatusCapabilityFile,
} from "../types.capability";
import {
  CAPABILITY_OPERATION_KEYS,
  CAPABILITY_WEATHER_KEYS,
} from "../types.capability";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 値が入っていると数えられるもの。空文字・空白・欠損記号は数えない。 */
const isPresent = (value: unknown): boolean => {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const text = value.trim();
  return text !== "" && !/^(?:-+|ー+|\*+|−+)$/u.test(text);
};

const uniqueStrings = (values: readonly (string | null)[]): string[] => [
  ...new Set(values.filter((value): value is string => isPresent(value))),
];

const summarizeOperations = (
  value: unknown,
  hasSourceUrl: boolean,
): CapabilityOperationSection => {
  const items = Array.isArray(value) ? value.filter(isRecord) : [];
  const fields: CapabilityOperationFields = {
    name: false,
    status: false,
    update: false,
    note: false,
  };
  for (const item of items) {
    for (const key of CAPABILITY_OPERATION_KEYS) {
      if (isPresent(item[key])) fields[key] = true;
    }
  }
  return {
    // 掲載があるかどうかは、行が取れたか、出典URLが登録されているかで決める。
    available: items.length > 0 || hasSourceUrl,
    count: items.length,
    fields,
    names: uniqueStrings(
      items.map(item => (typeof item.name === "string" ? item.name : null)),
    ),
    statuses: uniqueStrings(
      items.map(item => (typeof item.status === "string" ? item.status : null)),
    ),
  };
};

const summarizeConditions = (
  result: Record<string, unknown>,
): CapabilityConditionsSection => {
  const weather = isRecord(result.weather) ? result.weather : {};
  const fields: CapabilityWeatherFields = {
    update: false,
    weather: false,
    temperature: false,
    snowDepth: false,
    snowfall: false,
    condition: false,
    windSpeed: false,
  };
  const points: string[] = [];
  for (const [point, raw] of Object.entries(weather)) {
    if (!isRecord(raw)) continue;
    points.push(point);
    for (const key of CAPABILITY_WEATHER_KEYS) {
      if (isPresent(raw[key])) fields[key] = true;
    }
  }
  const urls = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter(
          (entry): entry is string => typeof entry === "string" && entry !== "",
        )
      : [];
  return {
    comment: isPresent(result.comment),
    news: urls(result.newsUrl).length > 0,
    points,
    fields,
  };
};

/**
 * 冬季に取得できた内容から台帳を組み立てる。値ではなく「取れるかどうか」だけを残す。
 * 対象の結果は営業期間中のものに限る。オフシーズンの結果を渡すと、取得できるはずの
 * 項目まで false になり、欠損警告が効かなくなる。
 */
export const buildCapabilityFromResult = (options: {
  resortId: string;
  result: unknown;
  source: CapabilitySource;
  observedAt: string;
  crawlerSourceHash?: string | null;
}): LatestStatusCapabilityFile => {
  const result = isRecord(options.result) ? options.result : {};
  const urls = (value: unknown): boolean =>
    Array.isArray(value) &&
    value.some(entry => typeof entry === "string" && entry.trim() !== "");
  return {
    version: 1,
    resortId: options.resortId,
    source: options.source,
    observedAt: options.observedAt,
    crawlerSourceHash: options.crawlerSourceHash ?? null,
    courses: summarizeOperations(result.courses, urls(result.courseUrl)),
    lifts: summarizeOperations(result.lifts, urls(result.liftUrl)),
    conditions: summarizeConditions(result),
  };
};

export type CapabilityGap = {
  category: "COURSES" | "LIFTS" | "WEATHER" | "COMMENT" | "NEWS";
  code: string;
  message: string;
};

/**
 * 台帳が「取得できる」としている項目が、今回の結果に無いものを挙げる。
 *
 * 台帳が false としている項目は対象にしない。台帳そのものが無い場合は何も返さない
 * ので、警告が出ないことを「正常」と読み替えてはいけない。
 */
export const findCapabilityGaps = (
  capability: LatestStatusCapabilityFile | null,
  result: unknown,
): CapabilityGap[] => {
  if (!capability) return [];
  const data = isRecord(result) ? result : {};
  const gaps: CapabilityGap[] = [];

  const operations = [
    { key: "courses", kind: "COURSES", label: "コース" },
    { key: "lifts", kind: "LIFTS", label: "リフト" },
  ] as const;
  for (const { key, kind, label } of operations) {
    const expected = capability[key];
    if (!expected.available) continue;
    const actual = summarizeOperations(data[key], true);
    if (expected.count > 0 && actual.count === 0) {
      gaps.push({
        category: kind,
        code: `CAPABILITY.MISSING_${kind}`,
        message: `${label}は冬季に${expected.count}件取得できるが、今回は0件だった`,
      });
      continue;
    }
    for (const field of CAPABILITY_OPERATION_KEYS) {
      if (expected.fields[field] && !actual.fields[field]) {
        gaps.push({
          category: kind,
          code: `CAPABILITY.MISSING_${kind}_FIELD`,
          message: `${label}の ${field} は冬季に取得できるが、今回はどの項目にも入っていない`,
        });
      }
    }
    const missingNames = expected.names.filter(
      name => !actual.names.includes(name),
    );
    if (expected.names.length > 0 && missingNames.length > 0) {
      gaps.push({
        category: kind,
        code: `CAPABILITY.MISSING_${kind}_NAMES`,
        message: `${label}の名前が取得できていない: ${missingNames.slice(0, 20).join(", ")}${missingNames.length > 20 ? ` ほか${missingNames.length - 20}件` : ""}`,
      });
    }
  }

  const conditions = summarizeConditions(data);
  for (const field of CAPABILITY_WEATHER_KEYS) {
    if (capability.conditions.fields[field] && !conditions.fields[field]) {
      gaps.push({
        category: "WEATHER",
        code: "CAPABILITY.MISSING_WEATHER_FIELD",
        message: `天気の ${field} は冬季に取得できるが、今回はどの地点にも入っていない`,
      });
    }
  }
  const missingPoints = capability.conditions.points.filter(
    point => !conditions.points.includes(point),
  );
  if (missingPoints.length > 0) {
    gaps.push({
      category: "WEATHER",
      code: "CAPABILITY.MISSING_WEATHER_POINT",
      message: `観測地点が取得できていない: ${missingPoints.join(", ")}`,
    });
  }
  if (capability.conditions.comment && !conditions.comment) {
    gaps.push({
      category: "COMMENT",
      code: "CAPABILITY.MISSING_COMMENT",
      message: "専用コメント欄は冬季に取得できるが、今回は空だった",
    });
  }
  if (capability.conditions.news && !conditions.news) {
    gaps.push({
      category: "NEWS",
      code: "CAPABILITY.MISSING_NEWS",
      message: "お知らせURLは冬季に登録されているが、今回は空だった",
    });
  }
  return gaps;
};
