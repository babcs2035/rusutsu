import type { PriceReference } from "../types";

/**
 * 出典を「表（まとまり）の見出しに出すもの」と「行ごとに出すもの」に分ける。
 *
 * 料金はほとんどが公式の料金ページ1つから取っているので、金額ごとに出典を
 * 付けると同じリンクが何十個も並ぶ。**半分以上の行が使っている出典**は見出しの
 * 横に1回だけ出し、行にはそれ以外の出典だけを出す。
 * 全行共通に限ると、パック料金のような別ページ由来の行が1つあるだけで
 * 料金ページのリンクが全行に散らばる。見出しの出典を使わない行は、行に
 * 自分の出典が出るので、どのページの金額かは読み違えない。
 *
 * 出典の無い行（空配列）は数えない。
 */
export const splitSources = (
  groups: number[][],
): { common: number[]; extras: number[][] } => {
  const withSources = groups
    .map(group => [...new Set(group)])
    .filter(group => group.length > 0);
  const countOf = new Map<number, number>();
  for (const number of withSources.flat()) {
    countOf.set(number, (countOf.get(number) ?? 0) + 1);
  }
  const common = [...countOf.entries()]
    .filter(([, count]) => count * 2 >= withSources.length)
    .map(([number]) => number)
    .sort((left, right) => left - right);
  return {
    common,
    extras: groups.map(group =>
      [...new Set(group)].filter(number => !common.includes(number)),
    ),
  };
};

/**
 * 「ゴンドラ・リフト券 - 北海道 ルスツリゾート」→「ゴンドラ・リフト券」。
 * 同じスキー場のページ同士を見分けるにはページ名だけで足りるので、
 * タイトル後半のサイト名を落とす。タイトルが無ければドメインを出す。
 */
export const sourceLabelOf = (reference: PriceReference) => {
  const head = reference.title?.split(/\s[-|｜]\s|｜/u)[0]?.trim();
  if (head) return head;
  try {
    return new URL(reference.url).hostname.replace(/^www\./u, "");
  } catch {
    return reference.url;
  }
};
