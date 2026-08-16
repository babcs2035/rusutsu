"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { PriceReference } from "../utils/priceTable";

/**
 * 料金の出典を論文の参考文献のように `[1]` で示す。
 *
 * **タップ・クリックで公式ページへ飛ぶ**。ホバーではページタイトルとURLを出して、
 * 飛ぶ前にどこへ行くのか分かるようにする（金額の根拠を確かめたい人が、
 * 押す前に「料金案内ページなのか営業時間ページなのか」を判断できる）。
 */
export const SourceMarks = ({
  numbers,
  references,
}: {
  numbers: number[];
  references: PriceReference[];
}) => {
  const byNumber = new Map(
    references.map(reference => [reference.number, reference]),
  );
  const shown = numbers
    .map(number => byNumber.get(number))
    .filter((reference): reference is PriceReference => Boolean(reference));
  if (shown.length === 0) return null;

  return (
    <sup className="ml-0.5 text-[0.6875rem] font-medium whitespace-nowrap">
      {shown.map(reference => (
        <SourceMarkTip key={reference.number} reference={reference} />
      ))}
    </sup>
  );
};

const SourceMarkTip = ({ reference }: { reference: PriceReference }) => (
  <TooltipProvider delay={200}>
    <Tooltip>
      <TooltipTrigger
        className="text-blue-600 no-underline hover:underline"
        aria-label={`出典 ${reference.number}: ${reference.title ?? reference.url}`}
      >
        <ExternalLinkComponent className="text-blue-600 no-underline hover:text-blue-700 hover:underline">
          [{reference.number}]
        </ExternalLinkComponent>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="max-w-[18rem] text-[0.6875rem]"
      >
        <div className="flex flex-col gap-0.5">
          {reference.title && (
            <p className="font-bold break-words">{reference.title}</p>
          )}
          <p className="text-muted-foreground break-all">{reference.url}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

/** 出典の一覧。表・計算結果の下に置いて [1] から辿れるようにする */
export const SourceList = ({ references }: { references: PriceReference[] }) =>
  references.length === 0 ? null : (
    <div className="flex flex-col gap-1">
      <p className="text-gray-700 text-xs font-medium">出典</p>
      {references.map(reference => (
        <div key={reference.number} className="flex gap-1.5 items-baseline">
          <span className="text-blue-600 text-xs font-medium whitespace-nowrap">
            [{reference.number}]
          </span>
          <ExternalLinkComponent className="text-gray-600 text-xs leading-relaxed break-all hover:text-blue-700">
            {reference.title ?? reference.url}
          </ExternalLinkComponent>
        </div>
      ))}
    </div>
  );
