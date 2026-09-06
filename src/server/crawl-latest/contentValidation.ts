import {
  CRAWL_LATEST_OPERATION_STATUSES,
  type CrawlLatestCategoryKind,
  type CrawlLatestRunInput,
} from "./contract";

type CrawlLatestCategory = CrawlLatestRunInput["categories"][number];
type CrawlLatestIssue = CrawlLatestRunInput["issues"][number];
type CrawlLatestIssueDetails = Exclude<CrawlLatestIssue["details"], undefined>;

type CategoryMetrics = {
  itemCount: number;
  usableItemCount: number;
  names: string[];
};

export type CrawlLatestCategoryValidation = CategoryMetrics & {
  kind: CrawlLatestCategoryKind;
  state: CrawlLatestCategory["state"];
  validationState: "VALID" | "WARNING" | "INVALID";
  eligibleForCurrent: boolean;
};

export type CrawlLatestServerValidationIssue = CrawlLatestIssue & {
  categoryKind: CrawlLatestCategoryKind;
  severity: "ERROR";
  blocksPromotion: true;
};

export type CrawlLatestPersistenceValidation = {
  categories: CrawlLatestCategoryValidation[];
  serverIssues: CrawlLatestServerValidationIssue[];
  outcome: "SUCCESS" | "PARTIAL" | "FAILED";
};

type ContentInspection = CategoryMetrics & {
  state: CrawlLatestCategory["state"];
  issues: CrawlLatestServerValidationIssue[];
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const issue = (
  categoryKind: CrawlLatestCategoryKind,
  code: string,
  message: string,
  options: {
    occurrences?: number;
    details?: CrawlLatestIssueDetails;
  } = {},
): CrawlLatestServerValidationIssue => ({
  categoryKind,
  severity: "ERROR",
  code,
  message,
  occurrences: options.occurrences ?? 1,
  blocksPromotion: true,
  ...(options.details === undefined ? {} : { details: options.details }),
});

const inspectComment = (category: CrawlLatestCategory): ContentInspection => {
  if (!isRecord(category.data)) {
    return {
      state: "EMPTY",
      itemCount: 0,
      usableItemCount: 0,
      names: [],
      issues: [
        issue(
          "COMMENT",
          "SERVER_VALIDATION.COMMENT_EMPTY",
          "The comment category must contain a non-empty string value.",
          { details: { reason: "missing_or_invalid_data" } },
        ),
      ],
    };
  }

  const value = category.data.value;
  if (typeof value !== "string" || value.trim() === "") {
    return {
      state: "EMPTY",
      itemCount: typeof value === "string" ? 1 : 0,
      usableItemCount: 0,
      names: [],
      issues: [
        issue(
          "COMMENT",
          "SERVER_VALIDATION.COMMENT_EMPTY",
          "The comment category must contain a non-empty string value.",
          {
            details: {
              reason:
                value === null
                  ? "null_value"
                  : typeof value === "string"
                    ? "blank_value"
                    : "missing_or_invalid_value",
            },
          },
        ),
      ],
    };
  }

  return {
    state: category.state,
    itemCount: 1,
    usableItemCount: 1,
    names: [],
    issues: [],
  };
};

const WEATHER_VALUE_KEYS = [
  "weather",
  "temperature",
  "snowDepth",
  "snowfall",
  "condition",
  "windSpeed",
] as const;

const isActualWeatherValue = (value: unknown): boolean =>
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" && value.trim() !== "");

const inspectWeather = (category: CrawlLatestCategory): ContentInspection => {
  if (!isRecord(category.data)) {
    return {
      state: "EMPTY",
      itemCount: 0,
      usableItemCount: 0,
      names: [],
      issues: [
        issue(
          "WEATHER",
          "SERVER_VALIDATION.WEATHER_NO_ACTUAL_VALUE",
          "The weather category must contain at least one actual weather value.",
          { details: { reason: "missing_or_invalid_data" } },
        ),
      ],
    };
  }

  const entries = Object.entries(category.data);
  const usablePointNames = entries.flatMap(([name, point]) => {
    if (!isRecord(point)) return [];
    return WEATHER_VALUE_KEYS.some(key => isActualWeatherValue(point[key]))
      ? [name]
      : [];
  });
  if (usablePointNames.length === 0) {
    return {
      state: "EMPTY",
      itemCount: entries.length,
      usableItemCount: 0,
      names: entries.map(([name]) => name),
      issues: [
        issue(
          "WEATHER",
          "SERVER_VALIDATION.WEATHER_NO_ACTUAL_VALUE",
          "The weather category must contain at least one actual weather value.",
          {
            details: {
              pointCount: entries.length,
              checkedFields: [...WEATHER_VALUE_KEYS],
            },
          },
        ),
      ],
    };
  }

  return {
    state: category.state,
    itemCount: entries.length,
    usableItemCount: usablePointNames.length,
    names: entries.map(([name]) => name),
    issues: [],
  };
};

const KNOWN_OPERATION_STATUSES = new Set<string>(
  CRAWL_LATEST_OPERATION_STATUSES,
);

const inspectOperations = (
  category: CrawlLatestCategory,
): ContentInspection => {
  const kind = category.kind;
  if (kind !== "COURSES" && kind !== "LIFTS") {
    throw new TypeError(`Unexpected operation category: ${kind}`);
  }
  if (!Array.isArray(category.data)) {
    return {
      state: "EMPTY",
      itemCount: 0,
      usableItemCount: 0,
      names: [],
      issues: [
        issue(
          kind,
          "SERVER_VALIDATION.OPERATION_EMPTY",
          `The ${kind.toLowerCase()} category must contain at least one item.`,
          { details: { reason: "missing_or_invalid_data" } },
        ),
      ],
    };
  }
  if (category.data.length === 0) {
    return {
      state: "EMPTY",
      itemCount: 0,
      usableItemCount: 0,
      names: [],
      issues: [
        issue(
          kind,
          "SERVER_VALIDATION.OPERATION_EMPTY",
          `The ${kind.toLowerCase()} category must contain at least one item.`,
        ),
      ],
    };
  }

  const emptyNameIndexes: number[] = [];
  const missingStatusIndexes: number[] = [];
  const unknownStatuses: Array<{ index: number; status: string }> = [];
  const invalidShapeIndexes: number[] = [];
  const normalizedNames: Array<string | null> = [];
  const individuallyValidIndexes = new Set<number>();

  for (const [index, item] of category.data.entries()) {
    if (!isRecord(item)) {
      invalidShapeIndexes.push(index);
      normalizedNames.push(null);
      continue;
    }

    const name = typeof item.name === "string" ? item.name.trim() : "";
    normalizedNames.push(name === "" ? null : name);
    if (name === "") emptyNameIndexes.push(index);

    const status = item.status;
    if (status === null || status === undefined) {
      missingStatusIndexes.push(index);
    } else if (
      typeof status !== "string" ||
      !KNOWN_OPERATION_STATUSES.has(status)
    ) {
      unknownStatuses.push({ index, status: String(status) });
    }

    if (
      name !== "" &&
      typeof status === "string" &&
      KNOWN_OPERATION_STATUSES.has(status)
    ) {
      individuallyValidIndexes.add(index);
    }
  }

  const nameCounts = new Map<string, number>();
  for (const name of normalizedNames) {
    if (name === null) continue;
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const duplicateNames = [...nameCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort();
  const duplicateNameSet = new Set(duplicateNames);
  const usableItemCount = normalizedNames.reduce(
    (count, name, index) =>
      count +
      (name !== null &&
      !duplicateNameSet.has(name) &&
      individuallyValidIndexes.has(index)
        ? 1
        : 0),
    0,
  );

  const issues: CrawlLatestServerValidationIssue[] = [];
  if (invalidShapeIndexes.length > 0) {
    issues.push(
      issue(
        kind,
        "SERVER_VALIDATION.OPERATION_INVALID_ITEM",
        `Every ${kind.toLowerCase()} item must be an object.`,
        {
          occurrences: invalidShapeIndexes.length,
          details: { indexes: invalidShapeIndexes },
        },
      ),
    );
  }
  if (emptyNameIndexes.length > 0) {
    issues.push(
      issue(
        kind,
        "SERVER_VALIDATION.OPERATION_NAME_EMPTY",
        `Every ${kind.toLowerCase()} item must have a non-empty name.`,
        {
          occurrences: emptyNameIndexes.length,
          details: { indexes: emptyNameIndexes },
        },
      ),
    );
  }
  if (missingStatusIndexes.length > 0) {
    issues.push(
      issue(
        kind,
        "SERVER_VALIDATION.OPERATION_STATUS_MISSING",
        `Every ${kind.toLowerCase()} item must have a non-null status.`,
        {
          occurrences: missingStatusIndexes.length,
          details: { indexes: missingStatusIndexes },
        },
      ),
    );
  }
  if (unknownStatuses.length > 0) {
    issues.push(
      issue(
        kind,
        "SERVER_VALIDATION.OPERATION_STATUS_UNKNOWN",
        `Every ${kind.toLowerCase()} item must use a known status.`,
        {
          occurrences: unknownStatuses.length,
          details: { items: unknownStatuses },
        },
      ),
    );
  }
  if (duplicateNames.length > 0) {
    issues.push(
      issue(
        kind,
        "SERVER_VALIDATION.OPERATION_DUPLICATE_NAME",
        `The ${kind.toLowerCase()} category must not contain duplicate names.`,
        {
          occurrences: duplicateNames.length,
          details: { names: duplicateNames },
        },
      ),
    );
  }

  return {
    state: category.state,
    itemCount: category.data.length,
    usableItemCount,
    names: normalizedNames.filter((name): name is string => name !== null),
    issues,
  };
};

const inspectSuccessfulCategory = (
  category: CrawlLatestCategory,
): ContentInspection => {
  if (category.kind === "COMMENT") return inspectComment(category);
  if (category.kind === "WEATHER") return inspectWeather(category);
  return inspectOperations(category);
};

const metricsWithoutPromotionValidation = (
  category: CrawlLatestCategory,
): CategoryMetrics => {
  const data = category.data;
  if (data === undefined || data === null) {
    return { itemCount: 0, usableItemCount: 0, names: [] };
  }
  if (category.kind === "COMMENT") {
    const value = isRecord(data) ? data.value : undefined;
    const usable = typeof value === "string" && value.trim() !== "";
    return {
      itemCount: value === null || value === undefined ? 0 : 1,
      usableItemCount: usable ? 1 : 0,
      names: [],
    };
  }
  if (category.kind === "WEATHER" && isRecord(data)) {
    const entries = Object.entries(data);
    return {
      itemCount: entries.length,
      usableItemCount: entries.filter(([, point]) => {
        if (!isRecord(point)) return false;
        return WEATHER_VALUE_KEYS.some(key => isActualWeatherValue(point[key]));
      }).length,
      names: entries.map(([name]) => name),
    };
  }
  if (Array.isArray(data)) {
    const names = data.flatMap(item => {
      if (!isRecord(item) || typeof item.name !== "string") return [];
      const name = item.name.trim();
      return name === "" ? [] : [name];
    });
    return {
      itemCount: data.length,
      usableItemCount: 0,
      names,
    };
  }
  return { itemCount: 1, usableItemCount: 0, names: [] };
};

const getRunOutcome = (
  categories: CrawlLatestCategoryValidation[],
): CrawlLatestPersistenceValidation["outcome"] => {
  if (categories.every(category => category.validationState === "INVALID")) {
    return "FAILED";
  }
  if (categories.some(category => category.validationState !== "VALID")) {
    return "PARTIAL";
  }
  return "SUCCESS";
};

export const buildCrawlLatestPersistenceValidation = (
  input: CrawlLatestRunInput,
): CrawlLatestPersistenceValidation => {
  const inspections = new Map<CrawlLatestCategoryKind, ContentInspection>();
  const serverIssues: CrawlLatestServerValidationIssue[] = [];

  for (const category of input.categories) {
    const inspection =
      category.state === "SUCCESS"
        ? inspectSuccessfulCategory(category)
        : {
            ...metricsWithoutPromotionValidation(category),
            state: category.state,
            issues: [],
          };
    inspections.set(category.kind, inspection);
    serverIssues.push(...inspection.issues);
  }

  const allIssues: CrawlLatestIssue[] = [...input.issues, ...serverIssues];
  const categories = input.categories.map(category => {
    const inspection = inspections.get(category.kind);
    if (!inspection) {
      throw new TypeError(`Missing category inspection: ${category.kind}`);
    }
    const applicableIssues = allIssues.filter(
      candidate =>
        candidate.categoryKind === undefined ||
        candidate.categoryKind === category.kind,
    );
    const blocksPromotion = applicableIssues.some(
      candidate => candidate.blocksPromotion,
    );
    const hasError = applicableIssues.some(
      candidate => candidate.severity === "ERROR" && candidate.blocksPromotion,
    );
    const validationState =
      inspection.state === "FAILED" || hasError || blocksPromotion
        ? "INVALID"
        : applicableIssues.length > 0
          ? "WARNING"
          : "VALID";
    const eligibleForCurrent =
      input.sourceMode === "LIVE" &&
      inspection.state === "SUCCESS" &&
      validationState !== "INVALID" &&
      inspection.usableItemCount > 0;

    return {
      kind: category.kind,
      state: inspection.state,
      validationState,
      eligibleForCurrent,
      itemCount: inspection.itemCount,
      usableItemCount: inspection.usableItemCount,
      names: inspection.names,
    } satisfies CrawlLatestCategoryValidation;
  });

  return {
    categories,
    serverIssues,
    outcome: getRunOutcome(categories),
  };
};
