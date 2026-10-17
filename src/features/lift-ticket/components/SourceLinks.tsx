import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { LiftTicketSourceQuote } from "../types";
import type { PriceReference } from "../utils/priceTable";
import { withSourceQuote } from "../utils/sourceQuote";

/**
 * 料金の出典リンク。営業状況など他の画面と同じく、青い枠の「出典 ↗」で
 * 公式ページへ飛ばす。
 *
 */
export const SourceLinks = ({
  numbers,
  references,
  quotes,
  single = false,
  className,
  compact = false,
}: {
  numbers: number[];
  references: PriceReference[];
  /** 出典番号 → 料金の記載場所。あればリンク先でその文言をハイライトする */
  quotes?: Record<number, LiftTicketSourceQuote>;
  /** 料金1つにつき出典は1つだけ出す。記載場所が分かる出典を優先する */
  single?: boolean;
  className?: string;
  /** 小さい文字の行に添えるとき。周りの文字より大きく見せない */
  compact?: boolean;
}) => {
  const shown = numbers
    .map(number => references.find(reference => reference.number === number))
    .filter((reference): reference is PriceReference => Boolean(reference));
  if (shown.length === 0) return null;
  const links = single
    ? [shown.find(reference => quotes?.[reference.number]) ?? shown[0]]
    : shown;

  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {links.map(reference => (
        <ExternalLinkComponent
          key={reference.number}
          href={withSourceQuote(reference.url, quotes?.[reference.number])}
          title={reference.url}
          aria-label={reference.title ? `出典: ${reference.title}` : "出典"}
          className={cn(
            "max-w-full rounded-md border border-blue-100 bg-blue-50 font-medium text-blue-700 underline underline-offset-2 hover:bg-blue-100 hover:text-blue-800",
            compact
              ? "min-h-5 px-1.5 py-0 text-[0.6875rem] md:text-xs"
              : "min-h-6 px-2 py-0.5 text-xs md:text-sm",
          )}
        >
          <span className="min-w-0 truncate">出典</span>
          <ExternalLink
            className={cn("shrink-0", compact ? "size-3" : "size-3.5")}
            aria-hidden="true"
          />
        </ExternalLinkComponent>
      ))}
    </span>
  );
};
