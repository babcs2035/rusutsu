import { z } from "zod";
import { correctionLinkPlatform, validateCorrectionLinks } from "./links";

export const CORRECTION_RESORT_FIELDS = [
  "nameJa",
  "nameEn",
  "shortName",
  "website",
  "descriptionShort",
  "descriptionLong",
  "courseImages",
  "outlineImages",
] as const;
export const CORRECTION_SLOPE_FIELDS = [
  "name",
  "level",
  "distance",
  "avg",
  "max",
  "piste",
  "morning",
  "night",
  "pisteSegments",
  "morningSegments",
  "nightSegments",
  "note",
  "image",
  "youtubeUrl",
  "searchWord",
  "maxWidth",
  "minWidth",
] as const;
export const CORRECTION_LIFT_FIELDS = [
  "name",
  "type",
  "speed",
  "capacity",
  "hood",
  "footrest",
  "oilShield",
  "towers",
  "distance",
  "morning",
  "night",
  "vertical",
  "top",
  "bottom",
  "maker",
  "year",
  "note",
  "link",
  "image",
  "youtubeUrl",
  "signal",
] as const;

const coordinatesSchema = z
  .array(
    z.tuple([
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
    ]),
  )
  .min(2)
  .max(100_000);

export const correctionItemSchema = z
  .object({
    targetKind: z.enum([
      "resort",
      "slope",
      "lift",
      "ticket",
      "source",
      "other",
      "slope-segment",
    ]),
    targetId: z.string().max(300).optional(),
    targetName: z.string().trim().max(300).optional(),
    field: z.string().trim().min(1).max(120),
    before: z.unknown().optional(),
    proposed: z.unknown(),
    action: z.enum(["change", "delete", "add"]).default("change"),
  })
  .superRefine((item, context) => {
    const editable =
      item.targetKind === "resort"
        ? CORRECTION_RESORT_FIELDS
        : item.targetKind === "lift"
          ? CORRECTION_LIFT_FIELDS
          : item.targetKind === "slope" || item.targetKind === "slope-segment"
            ? CORRECTION_SLOPE_FIELDS
            : null;
    if (
      editable &&
      item.field !== "coordinates" &&
      !(item.targetKind === "resort" && correctionLinkPlatform(item.field)) &&
      !editable.includes(item.field as never)
    )
      context.addIssue({
        code: "custom",
        path: ["field"],
        message: "この項目は修正できません。",
      });
    if (item.targetKind === "resort" && correctionLinkPlatform(item.field)) {
      try {
        validateCorrectionLinks("validation", item.field, item.proposed);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["proposed"],
          message: "リンクのURLと種類を確認してください。",
        });
      }
    }
    if (
      (item.action === "add" || item.field === "coordinates") &&
      !coordinatesSchema.safeParse(item.proposed).success
    )
      context.addIssue({
        code: "custom",
        path: ["proposed"],
        message: "2点以上の正しい座標を指定してください。",
      });
    if (item.field.endsWith("Segments")) {
      const segments = z
        .array(
          z.object({
            from: z.number().finite().min(0).max(1),
            to: z.number().finite().min(0).max(1),
            value: z.enum(["○", "△", "×"]),
          }),
        )
        .max(100)
        .safeParse(item.proposed);
      if (
        !segments.success ||
        segments.data.some(
          (segment, index) =>
            segment.from >= segment.to ||
            (item.field !== "pisteSegments" && segment.value === "△") ||
            (index > 0 && segment.from < segments.data[index - 1]?.to),
        )
      )
        context.addIssue({
          code: "custom",
          path: ["proposed"],
          message: "区間の範囲を確認してください。",
        });
    }
    if (
      [
        "hood",
        "footrest",
        "oilShield",
        "piste",
        "morning",
        "night",
        "signal",
      ].includes(item.field)
    ) {
      if (
        item.proposed !== "○" &&
        item.proposed !== "×" &&
        !(item.field === "piste" && item.proposed === "△") &&
        item.proposed !== null
      )
        context.addIssue({
          code: "custom",
          path: ["proposed"],
          message: "はい・いいえ・未設定から選んでください。",
        });
    }
    if (
      [
        "distance",
        "avg",
        "max",
        "capacity",
        "towers",
        "maxWidth",
        "minWidth",
        "vertical",
        "top",
        "bottom",
        "year",
      ].includes(item.field) &&
      item.proposed !== null &&
      (typeof item.proposed !== "number" ||
        !Number.isFinite(item.proposed) ||
        item.proposed < 0)
    )
      context.addIssue({
        code: "custom",
        path: ["proposed"],
        message: "0以上の数値を入力してください。",
      });
  });

export const submitCorrectionSchema = z.object({
  operationKey: z.string().uuid(),
  proof: z
    .object({
      token: z.string().max(2000),
      nonce: z.string().regex(/^\d{1,10}$/),
    })
    .optional(),
  resortId: z.string().regex(/^[a-z0-9-]+$/),
  context: z.record(z.string(), z.unknown()).optional(),
  returnTo: z.string().max(2000).optional(),
  items: z.array(correctionItemSchema).min(1).max(200),
  comment: z.string().trim().max(5000).optional(),
});

export type SubmitCorrectionInput = z.input<typeof submitCorrectionSchema>;
export type CorrectionItem = z.infer<typeof correctionItemSchema>;

export const EMPTY_PLAN = {
  documents: [],
  beforeDocuments: [],
  resort: null,
  ticket: null,
  elevations: [],
};
