// 名前の先頭にある番号・記号。後ろに名前が続くときだけ外す
// （「A1 ファミリー」「[C1] メロディ」→「ファミリー」「メロディ」。「A2」「E.T」のように名前そのものは残す）。
const LEADING_CODE =
  /^(?:\[[^\]]{1,12}\]\s*|［[^］]{1,12}］\s*|[①-⑳⑴-⒇❶-➓]\s*|[Ⅰ-Ⅻ]{1,3}\s+|\(\d{1,2}\)\s*|（\d{1,2}）\s*|\d{1,2}[-‐－][A-Za-z0-9]{1,2}\s+|\d{1,2}[.．)）]\s*|\d{1,2}\s+|[A-Z]{1,2}[-‐－]?\d{1,3}[a-z]?\s+|[A-Z]\s+|No\.?\s?\d+\s+)(?=\S)/u;

/**
 * 検索語に入れるコース名・リフト名。
 * 区間の識別子（「_#中部」「_3」）と先頭の番号は動画の題名に出ないので外す。
 */
export const toSearchWordItemName = (itemName: string): string => {
  const name = itemName
    .replace(/^無名_(?=\D)/u, "")
    .replace(/_#.*$/u, "")
    .replace(/_\d+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  // 名前不明の印や記号だけの名前は、検索しても目当ての動画に届かない。
  if (/^(?:名前不明|無名(?:_\d+)?)$/u.test(name) || !/[\p{L}\p{N}]/u.test(name))
    return "";
  const code = name.match(LEADING_CODE);
  if (!code) return name;
  const rest = name.slice(code[0].length).trim();
  return rest || name;
};

/**
 * 「スキー場の正式名 コース名」。resortName には正式名（スキー場込み）を渡す。
 * 名前が無いものは空にする（スキー場名だけでは別の動画ばかり出るため）。
 */
export const buildDefaultSearchWord = (
  resortName: string,
  itemName: string,
): string => {
  const name = toSearchWordItemName(itemName);
  return name ? [resortName.trim(), name].filter(Boolean).join(" ") : "";
};

// 空欄、または変更前の自動生成値のままなら、新しい名前に追従させる。
export const updateDefaultSearchWord = (
  currentValue: string,
  resortName: string,
  previousItemName: string,
  nextItemName: string,
): string => {
  if (
    currentValue.trim() !== "" &&
    currentValue !== buildDefaultSearchWord(resortName, previousItemName)
  ) {
    return currentValue;
  }
  return buildDefaultSearchWord(resortName, nextItemName);
};
