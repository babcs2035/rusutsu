/** 利用者の人物区分と，年齢入力の案内を管理する． */
import type { TicketPartyCategory, TicketPartyGroup } from "../types";

export const TICKET_PARTY_CATEGORY_LABELS: Record<TicketPartyCategory, string> =
  {
    preschool: "未就学児",
    elementary: "小学生",
    junior_high: "中学生",
    high_school: "高校生",
    university: "大学・専門学生",
    adult: "大人",
    disabled: "障がい者",
    other: "学校区分なし",
  };

/** 学校区分ごとにあり得る年齢（早生まれ・遅生まれの両方を含む） */
const SCHOOL_AGE_RANGES: Partial<
  Record<TicketPartyCategory, { min: number; max: number }>
> = {
  preschool: { min: 0, max: 6 },
  elementary: { min: 6, max: 12 },
  junior_high: { min: 12, max: 15 },
  high_school: { min: 15, max: 18 },
};

/** 入力した年齢が学校区分にあり得ない場合の案内。障がい者は学校区分で見る */
export const schoolAgeMismatchOf = (group: TicketPartyGroup) => {
  const category =
    group.category === "disabled"
      ? (group.baseCategory ?? "adult")
      : group.category;
  const range = SCHOOL_AGE_RANGES[category];
  if (group.age == null || !range) return null;
  if (group.age >= range.min && group.age <= range.max) return null;
  return `${TICKET_PARTY_CATEGORY_LABELS[category]}は${range.min}〜${range.max}歳です。年齢を確認してください。`;
};
