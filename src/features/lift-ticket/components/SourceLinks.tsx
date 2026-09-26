import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { PriceReference } from "../utils/priceTable";
import { sourceLabelOf } from "../utils/sources";

/**
 * 料金の出典リンク。営業状況など他の画面と同じく、青い枠の「出典 ↗」で
 * 公式ページへ飛ばす。
 *
 * ホバーには頼らない（スマホではホバーが無く、押す前に行き先が分からない）。
 * 行き先はリンク文字にページ名として出す。
 */
export const SourceLinks = ({
  numbers,
  references,
  className,
}: {
  numbers: number[];
  references: PriceReference[];
  className?: string;
}) => {
  const shown = numbers
    .map(number => references.find(reference => reference.number === number))
    .filter((reference): reference is PriceReference => Boolean(reference));
  if (shown.length === 0) return null;

  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {shown.map(reference => (
        <ExternalLinkComponent
          key={reference.number}
          href={reference.url}
          title={reference.url}
          className="min-h-6 max-w-full rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 underline underline-offset-2 hover:bg-blue-100 hover:text-blue-800"
        >
          <span className="min-w-0 truncate">
            出典: {sourceLabelOf(reference)}
          </span>
          <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        </ExternalLinkComponent>
      ))}
    </span>
  );
};
