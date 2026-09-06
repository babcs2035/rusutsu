import { z } from "zod";

export const DATA_DOCUMENT_MAX_KEY_LENGTH = 1_024;
export const DATA_DOCUMENT_MAX_CONTENT_LENGTH = 8 * 1024 * 1024;
export const DATA_DOCUMENT_MAX_BATCH_SIZE = 100;
export const DATA_DOCUMENT_MAX_REQUEST_BYTES = 64 * 1024 * 1024;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MEDIA_TYPE_PATTERN =
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*.+)?$/u;

const JSON_MEDIA_TYPE = "application/json";
const GEOJSON_MEDIA_TYPE = "application/geo+json";

const baseMediaType = (value: string): string =>
  value.split(";", 1)[0]?.trim().toLowerCase() ?? "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isPosition = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  value.every(
    ordinate => typeof ordinate === "number" && Number.isFinite(ordinate),
  );

const isPositions = (value: unknown, minimum: number): value is number[][] =>
  Array.isArray(value) && value.length >= minimum && value.every(isPosition);

const isRing = (value: unknown): boolean => {
  if (!isPositions(value, 4)) return false;
  const first = value[0];
  const last = value[value.length - 1];
  return (
    first.length === last.length &&
    first.every((ordinate, index) => ordinate === last[index])
  );
};

const isGeometry = (value: unknown, depth = 0): boolean => {
  if (!isRecord(value) || depth > 20) return false;
  const coordinates = value.coordinates;
  switch (value.type) {
    case "Point":
      return isPosition(coordinates);
    case "MultiPoint":
      return isPositions(coordinates, 0);
    case "LineString":
      return isPositions(coordinates, 2);
    case "MultiLineString":
      return (
        Array.isArray(coordinates) &&
        coordinates.every(line => isPositions(line, 2))
      );
    case "Polygon":
      return (
        Array.isArray(coordinates) &&
        coordinates.length > 0 &&
        coordinates.every(isRing)
      );
    case "MultiPolygon":
      return (
        Array.isArray(coordinates) &&
        coordinates.every(
          polygon =>
            Array.isArray(polygon) &&
            polygon.length > 0 &&
            polygon.every(isRing),
        )
      );
    case "GeometryCollection":
      return (
        Array.isArray(value.geometries) &&
        value.geometries.every(geometry => isGeometry(geometry, depth + 1))
      );
    default:
      return false;
  }
};

const isGeoJsonFeatureCollection = (value: unknown): boolean => {
  if (!isRecord(value) || value.type !== "FeatureCollection") return false;
  if (!Array.isArray(value.features)) return false;
  return value.features.every(feature => {
    if (!isRecord(feature) || feature.type !== "Feature") return false;
    if (
      feature.properties !== null &&
      feature.properties !== undefined &&
      !isRecord(feature.properties)
    )
      return false;
    // RFC 7946 permits a Feature with a null geometry.
    return feature.geometry === null || isGeometry(feature.geometry);
  });
};

/**
 * Generic internal API boundary validation. Domain services still perform
 * stricter semantic validation, but malformed JSON/GeoJSON must never reach
 * the canonical database even if a client implementation is buggy.
 */
export const validateDataDocumentContent = (document: {
  key: string;
  content: string;
  mediaType: string;
}): string[] => {
  const errors: string[] = [];
  const mediaType = baseMediaType(document.mediaType);
  const isJsonKey = document.key.endsWith(".json");
  const isGeoJsonKey = document.key.endsWith(".geojson");

  if (isJsonKey && mediaType !== JSON_MEDIA_TYPE) {
    errors.push(".json documents require application/json");
  }
  if (isGeoJsonKey && mediaType !== GEOJSON_MEDIA_TYPE) {
    errors.push(".geojson documents require application/geo+json");
  }

  const isJsonMediaType =
    mediaType === JSON_MEDIA_TYPE ||
    mediaType === GEOJSON_MEDIA_TYPE ||
    mediaType.endsWith("+json");
  if (!isJsonMediaType && !isJsonKey && !isGeoJsonKey) return errors;

  let parsed: unknown;
  try {
    parsed = JSON.parse(document.content) as unknown;
  } catch {
    errors.push("Document content must be valid JSON");
    return errors;
  }

  if (!isRecord(parsed) && !Array.isArray(parsed)) {
    errors.push("JSON document root must be an object or array");
    return errors;
  }

  if (isGeoJsonKey || mediaType === GEOJSON_MEDIA_TYPE) {
    if (!isGeoJsonFeatureCollection(parsed)) {
      errors.push("GeoJSON must be a valid FeatureCollection");
    }
    return errors;
  }

  if (
    /^resorts-temporary\/(?:lift_detail|slope_detail)\/.+\.json$/u.test(
      document.key,
    ) &&
    !Array.isArray(parsed)
  ) {
    errors.push("Detail documents must contain a JSON array");
  }
  if (
    (document.key === "SkiResortLinks.json" ||
      document.key === "resorts-temporary/lift_confirmed.json" ||
      /^resorts-temporary\/latest_status_mapping\/.+\.json$/u.test(
        document.key,
      ) ||
      /^reviews\/.+\/(?:detail|article)\.json$/u.test(document.key) ||
      /^lift-ticket\/.+\/tickets\/.+\.json$/u.test(document.key)) &&
    !isRecord(parsed)
  ) {
    errors.push("This document family requires a JSON object");
  }

  return errors;
};

const hasControlCharacter = (value: string): boolean =>
  [...value].some(character => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

/**
 * DataDocument のキーは src/private/data からの相対パスである。
 * OS に依存しない一意な表現にするため、区切りには `/` だけを許可する。
 */
export const isSafeDataDocumentKey = (value: string): boolean => {
  if (
    value.length === 0 ||
    value.length > DATA_DOCUMENT_MAX_KEY_LENGTH ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return false;
  }

  return value
    .split("/")
    .every(
      segment => segment.length > 0 && segment !== "." && segment !== "..",
    );
};

/** 空文字は全件、それ以外は安全なPOSIXパス前方一致として扱う。 */
export const isSafeDataDocumentPrefix = (value: string): boolean => {
  if (value === "") return true;
  if (
    value.length > DATA_DOCUMENT_MAX_KEY_LENGTH ||
    value.startsWith("/") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return false;
  }

  const withoutTrailingSlash = value.endsWith("/") ? value.slice(0, -1) : value;
  return isSafeDataDocumentKey(withoutTrailingSlash);
};

export const dataDocumentKeySchema = z
  .string()
  .refine(
    isSafeDataDocumentKey,
    "Safe src/private/data-relative POSIX path required",
  );

export const dataDocumentPrefixSchema = z
  .string()
  .refine(isSafeDataDocumentPrefix, "Safe POSIX path prefix required");

export const dataDocumentMediaTypeSchema = z
  .string()
  .min(3)
  .max(255)
  .regex(MEDIA_TYPE_PATTERN, "Valid media type required")
  .refine(value => !hasControlCharacter(value), "Valid media type required");

export const dataDocumentHashSchema = z.string().regex(SHA256_PATTERN);

export const storedDataDocumentSchema = z.strictObject({
  key: dataDocumentKeySchema,
  content: z
    .string()
    .max(DATA_DOCUMENT_MAX_CONTENT_LENGTH)
    .refine(
      value =>
        new TextEncoder().encode(value).byteLength <=
        DATA_DOCUMENT_MAX_CONTENT_LENGTH,
      "Document exceeds byte limit",
    ),
  mediaType: dataDocumentMediaTypeSchema,
  hash: dataDocumentHashSchema,
  version: z.number().int().positive(),
});

export const storedDataDocumentSummarySchema = storedDataDocumentSchema.omit({
  content: true,
});

export const dataDocumentSourceSchema = z.enum(["database", "bundled"]);

export const dataDocumentSchema = storedDataDocumentSchema.extend({
  source: dataDocumentSourceSchema,
  // Bundled files have no DB revision yet and are represented as version 0.
  version: z.number().int().nonnegative(),
});

export const dataDocumentSummarySchema = dataDocumentSchema.omit({
  content: true,
});

export const dataDocumentWriteSchema = z
  .strictObject({
    key: dataDocumentKeySchema,
    content: z
      .string()
      .max(DATA_DOCUMENT_MAX_CONTENT_LENGTH)
      .refine(
        value =>
          new TextEncoder().encode(value).byteLength <=
          DATA_DOCUMENT_MAX_CONTENT_LENGTH,
        "Document exceeds byte limit",
      ),
    mediaType: dataDocumentMediaTypeSchema,
    // null means that neither a DB row nor a bundled fallback may currently exist.
    expectedHash: dataDocumentHashSchema.nullable(),
  })
  .superRefine((document, context) => {
    for (const message of validateDataDocumentContent(document)) {
      context.addIssue({ code: "custom", message, path: ["content"] });
    }
  });

export const dataDocumentBatchWriteSchema = z
  .strictObject({
    documents: z
      .array(dataDocumentWriteSchema)
      .min(1)
      .max(DATA_DOCUMENT_MAX_BATCH_SIZE),
  })
  .superRefine((input, context) => {
    const keys = new Set<string>();
    for (const [index, document] of input.documents.entries()) {
      if (keys.has(document.key)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate document key: ${document.key}`,
          path: ["documents", index, "key"],
        });
      }
      keys.add(document.key);
    }
  });

export const dataDocumentGetResponseSchema = z.strictObject({
  document: dataDocumentSchema.nullable(),
});

export const dataDocumentListResponseSchema = z.strictObject({
  documents: z.array(dataDocumentSummarySchema),
});

export const dataDocumentWriteResponseSchema = z.strictObject({
  documents: z.array(dataDocumentSchema),
});

export const dataDocumentConflictResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal("HASH_CONFLICT"),
    message: z.string(),
    details: z.strictObject({
      conflicts: z.array(
        z.strictObject({
          key: dataDocumentKeySchema,
          expectedHash: dataDocumentHashSchema.nullable(),
          actualHash: dataDocumentHashSchema.nullable(),
        }),
      ),
    }),
  }),
});

export type StoredDataDocument = z.infer<typeof storedDataDocumentSchema>;
export type StoredDataDocumentSummary = z.infer<
  typeof storedDataDocumentSummarySchema
>;
export type DataDocument = z.infer<typeof dataDocumentSchema>;
export type DataDocumentSummary = z.infer<typeof dataDocumentSummarySchema>;
export type DataDocumentWrite = z.infer<typeof dataDocumentWriteSchema>;

export type DataDocumentHashConflict = {
  key: string;
  expectedHash: string | null;
  actualHash: string | null;
};

export class DataDocumentConflictError extends Error {
  constructor(readonly conflicts: DataDocumentHashConflict[]) {
    super("One or more DataDocument hashes did not match");
    this.name = "DataDocumentConflictError";
  }
}
