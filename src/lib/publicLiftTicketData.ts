import { z } from "zod";
import type { LiftTicketData } from "@/features/lift-ticket/types";

const text = z.string();
const optionalText = text.nullable().optional();
const number = z.number().finite().nullable().optional();
const flag = z.boolean().optional();
const strings = z.array(text).optional();
const named = { id: text, name_ja: text, official_label_ja: optionalText };
const notes = { notes_ja: optionalText };
const range = z.object({ start: text, end: text });
const period = z
  .object({
    start: optionalText,
    end: optionalText,
    start_time: optionalText,
    end_time: optionalText,
    deadline_ja: optionalText,
    ...notes,
  })
  .nullable()
  .optional();
const target = z
  .object({
    official_label_ja: optionalText,
    description_ja: optionalText,
    nominal_age: number,
    genders: strings,
    ...notes,
  })
  .nullable()
  .optional();

/**
 * Public calculation/display contract. z.object strips unknown fields at every
 * object boundary; new admin/source fields are never implicitly made public.
 * Keep sources and operating_hours: citations and day-ticket duration use them.
 */
export const publicLiftTicketDataSchema = z.object({
  schema_version: text,
  resort: z.object({ id: text }),
  season: z.object({
    id: text,
    label_ja: text,
    start_date: optionalText,
    end_date: optionalText,
    ...notes,
  }),
  sources: z
    .array(z.object({ id: text, url: optionalText, page_title: optionalText }))
    .optional(),
  operating_hours: z
    .array(
      z.object({
        id: text,
        hours_type: text.optional(),
        calendar_ids: strings,
        start_time: optionalText,
        end_time: optionalText,
      }),
    )
    .optional(),
  audiences: z.array(
    z.object({
      ...named,
      age_min: number,
      age_max: number,
      school_levels: strings,
      is_disability_qualified: flag,
      base_audience_id: optionalText,
      is_default: flag,
      ...notes,
    }),
  ),
  calendars: z.array(
    z.object({
      ...named,
      included_day_types: strings,
      included_dates: strings,
      included_date_ranges: z.array(range).optional(),
      excluded_dates: strings,
      excluded_date_ranges: z.array(range).optional(),
      ...notes,
    }),
  ),
  products: z.array(
    z.object({
      ...named,
      validity: z
        .object({
          mode: text.optional(),
          hours: number,
          days: number,
          rides: number,
          start_time: optionalText,
          end_time: optionalText,
          usable_within_ja: optionalText,
          ...notes,
        })
        .optional(),
      area_ids: strings,
      covers_hours_types: z.array(text).nullable().optional(),
      included_items: z
        .array(
          z.object({
            type: text.optional(),
            name_ja: text,
            description_ja: optionalText,
            ...notes,
          }),
        )
        .optional(),
      shared_with_resorts: z
        .array(z.object({ resort_id: optionalText, name_ja: text.optional() }))
        .optional(),
      ...notes,
    }),
  ),
  channels: z.array(
    z.object({
      id: text,
      name_ja: text,
      url: optionalText,
      purchase_deadline_ja: optionalText,
      ...notes,
    }),
  ),
  offers: z.array(
    z.object({
      ...named,
      discount_reasons: strings,
      product_id: text,
      audience_ids: strings,
      calendar_ids: strings,
      channel_ids: strings,
      target_genders: target,
      target_qualification: target,
      sales_period: period,
      use_period: period,
      purchase_deadline: z
        .object({
          same_day_allowed: z.boolean().nullable().optional(),
          days_before_use: number,
          deadline_date: optionalText,
          official_text_ja: optionalText,
        })
        .nullable()
        .optional(),
      price: z
        .object({
          currency: text.optional(),
          amount: number,
          base_offer_id: optionalText,
          discount: z.object({ amount: number, percent: number }).optional(),
          range: z.object({ min: number, max: number }).nullable().optional(),
          live_lookup_required: flag,
          live_lookup_url: optionalText,
          observed_amount: number,
          ...notes,
        })
        .optional(),
      requirements: z
        .array(
          z.object({ description_ja: text.optional(), proof_ja: optionalText }),
        )
        .optional(),
      source_refs: strings,
      ...notes,
    }),
  ),
  party_rules: z.array(z.object({ ...named, description_ja: optionalText })),
  fees: z.array(
    z.object({
      ...named,
      amount: number,
      currency: text.optional(),
      applies_to_product_ids: strings,
      ...notes,
    }),
  ),
  calculation_policy: z
    .object({
      currency: text.optional(),
      tax_included: z.boolean().nullable().optional(),
      best_price_hint_ja: optionalText,
      ...notes,
    })
    .optional(),
  data_quality: z.object({
    status: z.enum(["complete", "needs_review", "failed"]),
  }),
}) satisfies z.ZodType<LiftTicketData>;

export function toClientLiftTicketData(value: unknown): LiftTicketData {
  const projected = publicLiftTicketDataSchema.parse(value);
  return {
    ...projected,
    sources: (projected.sources ?? [])
      .filter(source => Boolean(source.url))
      .map(source => ({
        id: source.id,
        url: source.url,
        page_title: source.page_title ?? null,
      })),
  };
}
