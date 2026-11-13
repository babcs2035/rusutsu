import {
  RESORT_LINK_GROUPS,
  type ResortLinkGroupView,
} from "@/features/resort-links/model";

export type LinkTableRow = {
  id: string;
  label: string;
  /** スキー場の並び順どおり。そのグループにリンクが無いスキー場は null */
  cells: Array<ResortLinkGroupView | null>;
};

/**
 * 比較のリンク集（PC）の行。グループを行・スキー場を列にする。
 * 行の順番はリンク集のタブと同じ固定順で、比較中のどこにもリンクが無いグループは出さない。
 */
export const linkTableRows = (
  groupsByResort: ReadonlyArray<readonly ResortLinkGroupView[]>,
): LinkTableRow[] =>
  RESORT_LINK_GROUPS.flatMap(definition => {
    const cells = groupsByResort.map(
      groups => groups.find(group => group.id === definition.id) ?? null,
    );
    return cells.some(Boolean)
      ? [{ id: definition.id, label: definition.label, cells }]
      : [];
  });
