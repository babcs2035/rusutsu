import { z } from "zod";
import { linkSaveSchema } from "@/features/links/model";
import {
  reviewContentSchema,
  reviewPublicationSchema,
} from "@/features/review/server/publicationContract";
import { liftTicketSeasonIdSchema } from "@/server/lift-tickets/contract";
import {
  adminSkiResortUpdateRequestSchema,
  skiResortIdSchema,
} from "@/server/ski-resorts/adminContract";
import type { EditKind } from "./contract";

const hash = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .nullable();
const properties = z.record(z.string(), z.unknown());
const coordinates = z
  .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
  .min(2)
  .max(100_000);
const mapping = z.strictObject({
  resortId: skiResortIdSchema,
  kind: z.enum(["courses", "lifts"]),
  latestFile: z.string().max(1024),
  mappingFileHash: hash,
  rows: z
    .array(
      z.object({
        crawledName: z.string().nullable(),
        geojsonName: z.string().nullable(),
        geometryId: z.string().optional(),
        crawledNames: z.array(z.string()).optional(),
      }),
    )
    .max(2000),
  geojsonNames: z.array(z.string()).max(10000).optional(),
  geometries: z
    .array(z.strictObject({ id: z.string(), name: z.string() }))
    .max(10000)
    .optional(),
});
const linkRequests = z.array(linkSaveSchema).max(20).optional();
const feature = z
  .object({
    type: z.literal("Feature"),
    properties: properties.nullable(),
    geometry: z.unknown().nullable(),
  })
  .passthrough();
const schemas = {
  resort: z.strictObject({
    id: skiResortIdSchema,
    request: adminSkiResortUpdateRequestSchema,
  }),
  links: linkSaveSchema,
  lift: z.strictObject({
    resortId: skiResortIdSchema,
    fileHash: hash,
    mapping: mapping.optional(),
    linkRequests,
    lifts: z
      .array(
        z.strictObject({
          targetSkiId: skiResortIdSchema,
          properties,
          coordinates,
        }),
      )
      .max(5000),
  }),
  slope: z.strictObject({
    resortId: skiResortIdSchema,
    sourceKind: z.enum(["curated", "osm"]),
    fileHash: hash,
    detailFileHash: hash,
    mapping: mapping.optional(),
    linkRequests,
    courses: z
      .array(
        z.strictObject({
          targetSkiId: skiResortIdSchema,
          properties,
          coordinates,
          detail: properties,
        }),
      )
      .max(5000),
    preservedFeatures: z.array(feature).max(5000),
    preservedDetails: z.array(properties).max(5000),
  }),
  "slope-order": z.strictObject({
    resortId: skiResortIdSchema,
    sourceKind: z.enum(["curated", "osm"]),
    fileHash: hash,
    orderedGeojsonNames: z.array(z.string().max(300)).max(5000),
  }),
  ticket: z.strictObject({
    resortId: skiResortIdSchema,
    seasonId: liftTicketSeasonIdSchema,
    data: properties,
    baseVersion: z.number().int().positive(),
  }),
  review: reviewContentSchema.and(
    z.object({ fileHash: z.string().regex(/^[a-f0-9]{64}$/) }),
  ),
  "review-import": reviewPublicationSchema,
  mapping,
};
// The review content contract is strict, so validate its content and hash separately.
export function validateEditPayload(kind: EditKind, raw: unknown): void {
  if (kind === "review") {
    const input = z
      .object({
        resortId: z.unknown(),
        detail: z.unknown(),
        article: z.unknown(),
        fileHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(raw);
    reviewContentSchema.parse({
      resortId: input.resortId,
      detail: input.detail,
      article: input.article,
    });
  } else schemas[kind].parse(raw);
}
