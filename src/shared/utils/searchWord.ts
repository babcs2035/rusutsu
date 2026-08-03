export const buildDefaultSearchWord = (
  resortName: string,
  itemName: string,
): string => [resortName.trim(), itemName.trim()].filter(Boolean).join(" ");

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
