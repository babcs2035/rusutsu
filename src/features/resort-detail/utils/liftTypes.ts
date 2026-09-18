/**
 * 索道の種別ラベル。
 * 「高速／低速」だけの区分ではゴンドラもロープウェイも同じ行に混ざるので、
 * まず乗り物の種類で分け、チェアリフトだけを速度で分ける。
 * 該当する索道がない区分は行を作らない（呼び出し側で空を落とす）。
 */
export const LIFT_TYPE_ORDER = [
  "ロープウェイ",
  "ケーブルカー",
  "ゴンドラ",
  "高速リフト",
  "低速リフト",
  "リフト",
  "動く歩道",
  "ロープトウ・Tバー",
  "その他",
] as const;

export type LiftTypeLabel = (typeof LIFT_TYPE_ORDER)[number];

/** 種別が空の索道もあるので、名前と速度も手掛かりに使う。 */
export const getLiftTypeLabel = ({
  type,
  speed,
  name,
}: {
  type?: string | null;
  speed?: string | null;
  name?: string | null;
}): LiftTypeLabel => {
  const source = `${type ?? ""} ${name ?? ""}`;
  if (/ケーブルカー|funicular/iu.test(source)) return "ケーブルカー";
  if (/ロープウェイ|ロープウェー|cable_car|aerial_tramway/iu.test(source)) {
    return "ロープウェイ";
  }
  if (/ゴンドラ|gondola|cabin|mixed_lift|テレキャビン/iu.test(source)) {
    return "ゴンドラ";
  }
  if (/動く歩道|ムービング|magic_carpet|moving_walkway/iu.test(source)) {
    return "動く歩道";
  }
  if (
    /ロープトウ|ロープリフト|Tバー|rope_tow|t-bar|j-bar|platter/iu.test(source)
  ) {
    return "ロープトウ・Tバー";
  }
  const isChair =
    /リフト|chair_lift|chairlift|ペア|シングル|トリプル|クワッド/iu.test(
      source,
    ) || Boolean(speed);
  if (!isChair) return "その他";
  if (/高速|express|fast/iu.test(`${speed ?? ""} ${source}`)) {
    return "高速リフト";
  }
  if (/低速/u.test(`${speed ?? ""} ${source}`)) return "低速リフト";
  return "リフト";
};

/** 表示順（LIFT_TYPE_ORDER）に並べ、1件もない種別は落とす。 */
export const groupByLiftType = <T>(
  rows: T[],
  toLabel: (row: T) => LiftTypeLabel,
) =>
  LIFT_TYPE_ORDER.map(label => ({
    label,
    rows: rows.filter(row => toLabel(row) === label),
  })).filter(group => group.rows.length > 0);
