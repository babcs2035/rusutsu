import { z } from "zod";

export const CRAWL_LATEST_SCHEMA_VERSION = 1 as const;
export const CRAWL_LATEST_MAX_BODY_BYTES = 2 * 1024 * 1024;

export const CRAWL_LATEST_CATEGORY_KINDS = [
  "COMMENT",
  "WEATHER",
  "COURSES",
  "LIFTS",
] as const;

export const CRAWL_LATEST_CATEGORY_STATES = [
  "SUCCESS",
  "EMPTY",
  "NOT_SUPPORTED",
  "FAILED",
] as const;

export const CRAWL_LATEST_OPERATION_STATUSES = [
  "○",
  "◯",
  "〇",
  "△",
  "×",
  "✕",
] as const;

const categoryKindSchema = z.enum(CRAWL_LATEST_CATEGORY_KINDS);
const categoryStateSchema = z.enum(CRAWL_LATEST_CATEGORY_STATES);
const sourceModeSchema = z.enum([
  "LIVE",
  "WAYBACK_VALIDATION",
  "LEGACY_IMPORT",
]);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const resortIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const nullableTextSchema = (max: number) => z.string().max(max).nullable();
const optionalTextSchema = (max: number) =>
  z.string().min(1).max(max).optional();
const httpUrlSchema = z
  .url()
  .max(2_048)
  .refine(value => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === ""
    );
  }, "HTTP(S) URL without credentials is required");
const sourceUrlsSchema = z.array(httpUrlSchema).max(20);

const weatherValueSchema = z.union([z.number(), z.string().max(100), z.null()]);
const weatherPointSchema = z.strictObject({
  update: nullableTextSchema(500),
  weather: nullableTextSchema(500),
  temperature: weatherValueSchema,
  snowDepth: weatherValueSchema,
  snowfall: weatherValueSchema,
  condition: nullableTextSchema(1_000),
  windSpeed: weatherValueSchema,
});
const weatherDataSchema = z
  .record(z.string().min(1).max(200), weatherPointSchema)
  .superRefine((value, context) => {
    if (Object.keys(value).length > 100) {
      context.addIssue({
        code: "custom",
        message: "weather must contain at most 100 points",
      });
    }
  });

const operationItemSchema = z.strictObject({
  name: z.string().min(1).max(300),
  status: z.enum(CRAWL_LATEST_OPERATION_STATUSES).nullable(),
  update: nullableTextSchema(1_000),
  note: nullableTextSchema(10_000),
});
const operationItemsSchema = z.array(operationItemSchema).max(2_000);
const commentDataSchema = z.strictObject({
  value: nullableTextSchema(100_000).refine(
    value => value === null || value.trim() !== "",
    "comment value must not be blank",
  ),
});

const categoryInputSchema = z.strictObject({
  kind: categoryKindSchema,
  state: categoryStateSchema,
  data: z.json().optional(),
  sourceUrls: sourceUrlsSchema.default([]),
});

const issueInputSchema = z.strictObject({
  externalId: optionalTextSchema(128),
  categoryKind: categoryKindSchema.optional(),
  severity: z.enum(["WARNING", "ERROR"]),
  code: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Z0-9][A-Z0-9_.-]*$/u),
  message: z.string().min(1).max(10_000),
  occurrences: z.number().int().min(1).max(1_000_000).default(1),
  firstOccurredAt: isoDateTimeSchema.optional(),
  lastOccurredAt: isoDateTimeSchema.optional(),
  blocksPromotion: z.boolean().default(false),
  details: z.json().optional(),
});

const artifactInputSchema = z.strictObject({
  categoryKind: categoryKindSchema.optional(),
  kind: z.literal("RENDERED_DOM"),
  state: z.enum(["AVAILABLE", "FAILED"]),
  pageKey: z.string().min(1).max(255),
  title: optionalTextSchema(2_000),
  requestedUrl: httpUrlSchema.optional(),
  finalUrl: httpUrlSchema.optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  storageKey: z
    .string()
    .min(1)
    .max(2_048)
    .refine(
      value =>
        ![...value].some(character => {
          const codePoint = character.codePointAt(0);
          return (
            codePoint !== undefined && (codePoint < 32 || codePoint === 127)
          );
        }),
      "storageKey must not contain control characters",
    )
    .optional(),
  sha256: sha256Schema.optional(),
  sizeBytes: z.number().int().nonnegative().safe().optional(),
  contentType: optionalTextSchema(255),
  contentEncoding: optionalTextSchema(100),
  captureError: optionalTextSchema(10_000),
  redactionVersion: z.number().int().positive(),
  issueExternalIds: z.array(z.string().min(1).max(128)).max(500).default([]),
  capturedAt: isoDateTimeSchema,
});

const addNestedIssues = (
  result: z.ZodSafeParseResult<unknown>,
  context: z.RefinementCtx,
  path: PropertyKey[],
) => {
  if (result.success) return;
  for (const issue of result.error.issues) {
    context.addIssue({
      code: "custom",
      message: issue.message,
      path: [...path, ...issue.path],
    });
  }
};

const isEmptyCategoryData = (
  kind: (typeof CRAWL_LATEST_CATEGORY_KINDS)[number],
  data: unknown,
) => {
  if (data === undefined || data === null) return true;
  if (kind === "COMMENT") {
    const parsed = commentDataSchema.safeParse(data);
    return parsed.success && parsed.data.value === null;
  }
  if (kind === "WEATHER") {
    return (
      typeof data === "object" &&
      !Array.isArray(data) &&
      Object.keys(data).length === 0
    );
  }
  return Array.isArray(data) && data.length === 0;
};

export const crawlLatestRunInputSchema = z
  .strictObject({
    schemaVersion: z.literal(CRAWL_LATEST_SCHEMA_VERSION),
    producerId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u)
      .default("crawl_latest"),
    resortId: resortIdSchema,
    observedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema,
    sourceMode: sourceModeSchema,
    archiveTimestamp: z
      .string()
      .regex(/^\d{8,14}$/u)
      .optional(),
    crawler: z
      .strictObject({
        file: optionalTextSchema(500),
        revision: optionalTextSchema(128),
        sourceSha256: sha256Schema.optional(),
      })
      .default({}),
    rawPayload: z.record(z.string().max(200), z.json()),
    categories: z.array(categoryInputSchema).length(4),
    issues: z.array(issueInputSchema).max(1_000).default([]),
    artifacts: z.array(artifactInputSchema).max(100).default([]),
  })
  .superRefine((input, context) => {
    if (
      input.producerId === "yuki_magi" &&
      (input.resortId !== "yuki-magi" ||
        input.categories.some(category => category.state !== "NOT_SUPPORTED"))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "YukiMagi diagnostic runs cannot contain resort current values",
        path: ["categories"],
      });
    }
    const observedAt = new Date(input.observedAt);
    const completedAt = new Date(input.completedAt);
    if (completedAt < observedAt) {
      context.addIssue({
        code: "custom",
        message: "completedAt must not be earlier than observedAt",
        path: ["completedAt"],
      });
    }

    if (
      (input.sourceMode === "WAYBACK_VALIDATION") !==
      (input.archiveTimestamp !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "archiveTimestamp is required only for WAYBACK_VALIDATION runs",
        path: ["archiveTimestamp"],
      });
    }

    const rawResortName = input.rawPayload.resortName;
    if (typeof rawResortName === "string" && rawResortName !== input.resortId) {
      context.addIssue({
        code: "custom",
        message: "rawPayload.resortName must match resortId",
        path: ["rawPayload", "resortName"],
      });
    }

    const seenKinds = new Set<string>();
    for (const [index, category] of input.categories.entries()) {
      if (seenKinds.has(category.kind)) {
        context.addIssue({
          code: "custom",
          message: `duplicate category kind: ${category.kind}`,
          path: ["categories", index, "kind"],
        });
      }
      seenKinds.add(category.kind);

      if (category.state === "SUCCESS") {
        if (category.data === undefined) {
          context.addIssue({
            code: "custom",
            message: "successful category requires data",
            path: ["categories", index, "data"],
          });
          continue;
        }

        if (category.kind === "COMMENT") {
          addNestedIssues(commentDataSchema.safeParse(category.data), context, [
            "categories",
            index,
            "data",
          ]);
        } else if (category.kind === "WEATHER") {
          const parsed = weatherDataSchema.safeParse(category.data);
          addNestedIssues(parsed, context, ["categories", index, "data"]);
          if (parsed.success && Object.keys(parsed.data).length === 0) {
            context.addIssue({
              code: "custom",
              message: "successful weather category must not be empty",
              path: ["categories", index, "data"],
            });
          }
        } else {
          const parsed = operationItemsSchema.safeParse(category.data);
          addNestedIssues(parsed, context, ["categories", index, "data"]);
          if (parsed.success && parsed.data.length === 0) {
            context.addIssue({
              code: "custom",
              message: "successful operation category must not be empty",
              path: ["categories", index, "data"],
            });
          }
        }
      } else if (
        (category.state === "EMPTY" || category.state === "NOT_SUPPORTED") &&
        !isEmptyCategoryData(category.kind, category.data)
      ) {
        context.addIssue({
          code: "custom",
          message: `${category.state} category data must be empty`,
          path: ["categories", index, "data"],
        });
      }
    }

    for (const kind of CRAWL_LATEST_CATEGORY_KINDS) {
      if (!seenKinds.has(kind)) {
        context.addIssue({
          code: "custom",
          message: `missing category kind: ${kind}`,
          path: ["categories"],
        });
      }
    }

    const issueIds = new Set<string>();
    for (const [index, issue] of input.issues.entries()) {
      if (issue.externalId) {
        if (issueIds.has(issue.externalId)) {
          context.addIssue({
            code: "custom",
            message: `duplicate issue externalId: ${issue.externalId}`,
            path: ["issues", index, "externalId"],
          });
        }
        issueIds.add(issue.externalId);
      }
      if (
        issue.firstOccurredAt &&
        issue.lastOccurredAt &&
        new Date(issue.lastOccurredAt) < new Date(issue.firstOccurredAt)
      ) {
        context.addIssue({
          code: "custom",
          message: "lastOccurredAt must not be earlier than firstOccurredAt",
          path: ["issues", index, "lastOccurredAt"],
        });
      }
    }

    const pageKeys = new Set<string>();
    const storageKeys = new Set<string>();
    for (const [index, artifact] of input.artifacts.entries()) {
      if (pageKeys.has(artifact.pageKey)) {
        context.addIssue({
          code: "custom",
          message: `duplicate artifact pageKey: ${artifact.pageKey}`,
          path: ["artifacts", index, "pageKey"],
        });
      }
      pageKeys.add(artifact.pageKey);

      if (artifact.storageKey) {
        if (storageKeys.has(artifact.storageKey)) {
          context.addIssue({
            code: "custom",
            message: `duplicate artifact storageKey: ${artifact.storageKey}`,
            path: ["artifacts", index, "storageKey"],
          });
        }
        storageKeys.add(artifact.storageKey);
      }

      if (artifact.issueExternalIds.some(issueId => !issueIds.has(issueId))) {
        context.addIssue({
          code: "custom",
          message: "artifact references an unknown issue externalId",
          path: ["artifacts", index, "issueExternalIds"],
        });
      }

      if (
        artifact.state === "AVAILABLE" &&
        (!artifact.storageKey ||
          !artifact.sha256 ||
          artifact.sizeBytes === undefined ||
          artifact.captureError !== undefined)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "AVAILABLE artifact requires storageKey, sha256 and sizeBytes, without captureError",
          path: ["artifacts", index],
        });
      }
      if (artifact.state === "FAILED" && !artifact.captureError) {
        context.addIssue({
          code: "custom",
          message: "FAILED artifact requires captureError",
          path: ["artifacts", index, "captureError"],
        });
      }
    }
  });

export type CrawlLatestRunInput = z.infer<typeof crawlLatestRunInputSchema>;
export type CrawlLatestCategoryKind =
  (typeof CRAWL_LATEST_CATEGORY_KINDS)[number];

export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export const crawlLatestRunIdSchema = z.string().cuid();
export { resortIdSchema as crawlLatestResortIdSchema, sourceModeSchema };
