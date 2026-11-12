import { z } from "zod";
import type {
  LiftTicketData,
  LiftTicketFee,
} from "@/features/lift-ticket/types";

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

const audience = z.object({
  ...named,
  age_min: number,
  age_max: number,
  school_levels: strings,
  is_disability_qualified: flag,
  base_audience_id: optionalText,
  is_default: flag,
  ...notes,
});

/**
 * Public calculation/display contract. z.object strips unknown fields at every
 * object boundary; new admin/source fields are never implicitly made public.
 * Keep sources and operating_hours: citations and day-ticket duration use them.
 */
export const publicLiftTicketDataSchema = z.object({
  schema_version: text,
  main_links: z
    .object({
      lift_price_url: optionalText,
      lift_purchase_url: optionalText,
      rental_price_url: optionalText,
      rental_purchase_url: optionalText,
    })
    .nullable()
    .optional(),
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
  audiences: z.array(audience),
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
      add_on_to_product_ids: strings,
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
      purchase_url: optionalText,
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
      source_quotes: z
        .array(
          z.object({
            source_id: text,
            text,
            prefix: optionalText,
            suffix: optionalText,
          }),
        )
        .optional(),
      ...notes,
    }),
  ),
  // components が無いと親子パック等のセット料金を計算できない
  party_rules: z.array(
    z.object({
      ...named,
      description_ja: optionalText,
      exclusive_group_id: text.optional(),
      calendar_ids: strings,
      channel_ids: strings,
      target_genders: target,
      target_qualification: target,
      components: z
        .array(
          z.object({
            role_ja: text,
            audience_ids: strings,
            product_ids: strings,
            min_count: number,
            max_count: number,
            per_qualifying_count: number,
            price_effect: z
              .object({
                type: text,
                amount: number,
                percent: number,
                ...notes,
              })
              .nullable()
              .optional(),
            ...notes,
          }),
        )
        .optional(),
      sales_period: period,
      use_period: period,
      source_refs: strings,
      source_quotes: z
        .array(
          z.object({
            source_id: text,
            text,
            prefix: optionalText,
            suffix: optionalText,
          }),
        )
        .optional(),
      ...notes,
    }),
  ),
  // 収集データは販売経路を applies_to_channel_ids、課金単位を unit（per_transaction
  // ＝1決済ごと）で持つ。画面の計算が読む channel_ids / charge_unit に変換する
  fees: z.array(
    z
      .object({
        ...named,
        amount: number,
        currency: text.optional(),
        applies_to_product_ids: strings,
        applies_to_channel_ids: strings,
        unit: z.string().nullable().optional(),
        // 変換済み（固定資料など）をもう一度通しても落とさない
        channel_ids: strings,
        charge_unit: z
          .enum(["per_person", "per_ticket", "per_payment"])
          .optional(),
        source_refs: strings,
        source_quotes: z
          .array(
            z.object({
              source_id: text,
              text,
              prefix: optionalText,
              suffix: optionalText,
            }),
          )
          .optional(),
        ...notes,
      })
      .transform(
        ({
          applies_to_channel_ids,
          unit,
          channel_ids,
          charge_unit,
          ...fee
        }) => {
          const chargeUnit: LiftTicketFee["charge_unit"] =
            charge_unit ??
            (unit === "per_transaction"
              ? "per_payment"
              : unit === "per_person" || unit === "per_ticket"
                ? unit
                : undefined);
          const channels = channel_ids?.length
            ? channel_ids
            : applies_to_channel_ids;
          return {
            ...fee,
            ...(channels?.length ? { channel_ids: channels } : {}),
            ...(chargeUnit ? { charge_unit: chargeUnit } : {}),
          };
        },
      ),
  ),
  rental_audiences: z.array(audience).optional(),
  rentals: z
    .array(
      z.object({
        ...named,
        shop_name_ja: optionalText,
        items: z.array(text),
        grade_ja: optionalText,
        audience_ids: strings,
        calendar_ids: strings,
        channel_ids: strings,
        purchase_url: optionalText,
        duration: z.object({
          mode: text,
          hours: number,
          days: number,
          after_days: number,
          start_time: optionalText,
          end_time: optionalText,
          ...notes,
        }),
        price: z.object({
          currency: text.optional(),
          amount: number,
          ...notes,
        }),
        target_qualification: target,
        purchase_deadline: z
          .object({
            same_day_allowed: z.boolean().nullable().optional(),
            days_before_use: number,
            deadline_date: optionalText,
            official_text_ja: optionalText,
          })
          .nullable()
          .optional(),
        use_period: period,
        sales_period: period,
        usable_at_night: z.boolean().nullable().optional(),
        source_refs: strings,
        source_quotes: z
          .array(
            z.object({
              source_id: text,
              text,
              prefix: optionalText,
              suffix: optionalText,
            }),
          )
          .optional(),
        ...notes,
      }),
    )
    .optional(),
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

const IMAGE_SOURCE_URL = /\.(png|jpe?g|gif|webp|svg)($|[?#])/iu;

/**
 * 画像の出典は、その画像を載せている公式ページのURLに置き換える。
 * 出典リンクで画像ファイルだけを開かず、ページのその位置（画像の近くの見出し）へ飛ばす。
 * PDFは開けばそのまま読めるので置き換えない。載せているページが記録されていなければ画像のURLのまま
 */
export const pageUrlsOfSources = (
  sources: Array<{
    id: string;
    url?: string | null;
    linked_from_source_id?: string | null;
  }>,
) => {
  const byId = new Map(sources.map(source => [source.id, source]));
  return new Map(
    sources.map(source => {
      let current = source;
      const seen = new Set<string>();
      while (
        IMAGE_SOURCE_URL.test(current.url ?? "") &&
        current.linked_from_source_id &&
        !seen.has(current.id)
      ) {
        seen.add(current.id);
        const parent = byId.get(current.linked_from_source_id);
        if (!parent?.url) break;
        current = parent;
      }
      return [source.id, current.url ?? null];
    }),
  );
};

const rawSourcesOf = (value: unknown) => {
  const sources = (value as { sources?: unknown } | null)?.sources;
  return Array.isArray(sources)
    ? sources.filter(
        (source): source is { id: string } => typeof source?.id === "string",
      )
    : [];
};

export function toClientLiftTicketData(value: unknown): LiftTicketData {
  const projected = publicLiftTicketDataSchema.parse(value);
  const pageUrls = pageUrlsOfSources(rawSourcesOf(value));
  return {
    ...projected,
    sources: (projected.sources ?? [])
      .filter(source => Boolean(source.url))
      .map(source => ({
        id: source.id,
        url: pageUrls.get(source.id) ?? source.url,
        page_title: source.page_title ?? null,
      })),
  };
}
