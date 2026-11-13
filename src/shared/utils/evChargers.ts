import { z } from "zod";

/**
 * スキー中に使えるEV充電器（スキー場の駐車場・センターハウスなど）。管理画面で手入力する。
 * 1件は「同じ種類・同じ出力の充電器のまとまり」。出力や種類が違えば別の行にする。
 */
const nullableText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .transform(value => value || null);

export const evChargerSchema = z
  .object({
    kind: z.enum(["quick", "normal"]),
    /** 1口あたりの出力（kW）。小数1桁まで */
    kw: z.number().positive().max(1_000),
    count: z.number().int().min(1).max(100),
    /** 管理会社・充電サービス（例: Terra Charge、e-Mobility Power） */
    operator: nullableText(100),
    /** GoGoEV など、その充電器のページ */
    url: z
      .union([
        z
          .string()
          .trim()
          .max(2_000)
          .regex(/^(https?:\/\/.+)?$/u, "URLは http(s):// で始めてください"),
        z.null(),
      ])
      .transform(value => value || null),
    /** 設置場所や利用条件（例: 第2駐車場、日帰り客も利用可） */
    note: nullableText(200),
  })
  .strict();

export type EvCharger = z.infer<typeof evChargerSchema>;

/** null は未確認、[] は確認済みで無し */
export const evChargersSchema = z.array(evChargerSchema).max(20).nullable();

/** DBの JSON を読む。形の合わないデータは未確認として扱う */
export const parseEvChargers = (value: unknown): EvCharger[] | null => {
  const parsed = evChargersSchema.safeParse(value ?? null);
  return parsed.success ? parsed.data : null;
};

export const EV_CHARGER_KIND_LABEL = { quick: "急速", normal: "普通" } as const;

const formatKw = (kw: number) =>
  `${Number.isInteger(kw) ? kw : kw.toFixed(1)}kW`;

/** 1行分の出力と口数（例: 急速50kW×2、6kW×4） */
export const formatEvChargerOutput = (
  charger: Pick<EvCharger, "kind" | "kw" | "count">,
  withKind = true,
) =>
  `${withKind && charger.kind === "quick" ? "急速" : ""}${formatKw(charger.kw)}×${charger.count}`;

/**
 * 一覧カードの1行。1行だけなら会社名まで、2行以上なら出力と口数だけを並べる。
 * 例: 「急速50kW×2 e-Mobility Power」「6kW×4, 50kW×1」
 */
export const summarizeEvChargers = (chargers: EvCharger[] | null) => {
  if (!chargers?.length) return null;
  const [only] = chargers;
  if (chargers.length === 1 && only)
    return [formatEvChargerOutput(only), only.operator]
      .filter(Boolean)
      .join(" ");
  return chargers
    .map(charger => formatEvChargerOutput(charger, false))
    .join(", ");
};
