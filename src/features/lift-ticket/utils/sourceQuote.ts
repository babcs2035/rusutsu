import type { LiftTicketSourceQuote } from "../types";

/** テキストフラグメントの語。, - & は区切りなので必ずエスケープする */
const encodeTerm = (value: string) =>
  encodeURIComponent(value).replace(/-/gu, "%2D");

/**
 * 出典URLに、料金が書かれた文言をハイライトさせるテキストフラグメントを付ける。
 * 対応しないブラウザや、文言がページと一致しないときは普通にページが開くだけ
 */
export const withSourceQuote = (
  url: string,
  quote: LiftTicketSourceQuote | undefined,
) => {
  if (!quote?.text || url.includes(":~:")) return url;
  const prefix = quote.prefix ? `${encodeTerm(quote.prefix)}-,` : "";
  const suffix = quote.suffix ? `,-${encodeTerm(quote.suffix)}` : "";
  // 「#price」のようなアンカー付きURLは、その後ろに :~:text= を続けられる
  const separator = url.includes("#") ? "" : "#";
  return `${url}${separator}:~:text=${prefix}${encodeTerm(quote.text)}${suffix}`;
};
