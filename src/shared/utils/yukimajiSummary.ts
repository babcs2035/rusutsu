/**
 * リフト券データの yukimaji 欄から、一覧カードに1行で出す雪マジの要約を作る。
 * 無料2回はどこでも同じなので書かず、適用期間・曜日の条件・割引クーポンの値段だけにする。
 * 例: 「1/4〜3/26 平日限定｜割引 1,000円引」「12/12〜3/28｜割引 2,500円」
 */

export type YukimajiCoupon = {
  period?: { start?: string | null; end?: string | null } | null;
  period_text_ja?: string | null;
  day_rule?: string | null;
  day_rule_text_ja?: string | null;
  uses_text_ja?: string | null;
  notes_ja?: string | null;
  price_rules?: Array<{
    price_effect?: {
      type?: string | null;
      amount?: number | null;
      percent?: number | null;
    } | null;
  }> | null;
} | null;
type Coupon = YukimajiCoupon;

export type YukimajiDocument = {
  status?: string | null;
  majibu_url?: string | null;
  benefit_text_ja?: string | null;
  period_text_ja?: string | null;
  free_coupon?: Coupon;
  discount_coupon?: Coupon;
} | null;

const DAY_RULE_LABEL: Record<string, string> = {
  weekday: "平日限定",
  weekend_holiday: "土日祝限定",
  saturday_sunday: "土日限定",
  weekday_and_saturday: "平日・土曜",
  mon_thu_excluding_holiday: "月〜木",
  by_period: "期間で曜日あり",
  listed_dates: "指定日のみ",
};

const monthDay = (date: string | null | undefined) => {
  const match = date?.match(/^\d{4}-(\d{2})-(\d{2})$/u);
  return match ? `${Number(match[1])}/${Number(match[2])}` : null;
};

export const yukimajiPeriodText = (coupon: Coupon) => {
  const start = monthDay(coupon?.period?.start);
  const end = monthDay(coupon?.period?.end);
  if (start && end) return `${start}〜${end}`;
  const text = coupon?.period_text_ja?.trim();
  if (!text) return null;
  // 「2026/12/12～2027/3/28（予定）」→「12/12〜3/28（予定）」。曜日の (月) も省く
  return text
    .replace(/\d{4}\//gu, "")
    .replace(/[(（][月火水木金土日祝][)）]/gu, "")
    .replace(/[～~]/gu, "〜");
};

const yen = (amount: number) => `${amount.toLocaleString("ja-JP")}円`;

const effectText = (effect: {
  type?: string | null;
  amount?: number | null;
  percent?: number | null;
}) => {
  if (effect.type === "fixed_total" && typeof effect.amount === "number")
    return yen(effect.amount);
  if (effect.type === "discount_amount" && typeof effect.amount === "number")
    return `${yen(effect.amount)}引`;
  if (effect.type === "discount_percent" && typeof effect.percent === "number")
    return effect.percent === 50 ? "半額" : `${effect.percent}%引`;
  return null;
};

/** 割引クーポンの値段。平日・休日などで値段が分かれるときは、最も安い値段に「〜」を付ける */
export const yukimajiDiscountText = (coupon: Coupon) => {
  const effects = (coupon?.price_rules ?? []).flatMap(rule =>
    rule.price_effect ? [rule.price_effect] : [],
  );
  const texts = [...new Set(effects.map(effectText).filter(Boolean))];
  if (texts.length <= 1) return texts[0] ?? null;
  const fixed = effects.flatMap(effect =>
    effect.type === "fixed_total" && typeof effect.amount === "number"
      ? [effect.amount]
      : [],
  );
  return fixed.length === effects.length
    ? `${yen(Math.min(...fixed))}〜`
    : `${texts[0]}など`;
};

export const summarizeYukimaji = (document: YukimajiDocument) => {
  if (document?.status !== "listed") return null;
  const free = document.free_coupon ?? null;
  const head = [
    yukimajiPeriodText(free ?? document.discount_coupon ?? null),
    free?.day_rule ? DAY_RULE_LABEL[free.day_rule] : null,
  ]
    .filter(Boolean)
    .join(" ");
  const discount = yukimajiDiscountText(document.discount_coupon ?? null);
  const parts = [head, discount ? `割引 ${discount}` : null].filter(Boolean);
  return parts.length ? parts.join("｜") : null;
};
