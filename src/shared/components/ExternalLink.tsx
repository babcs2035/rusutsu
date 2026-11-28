"use client";

import { ExternalLink } from "lucide-react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * 外部サイトへのリンク。`target="_blank" rel="noopener noreferrer"` を自動付与。
 *
 * 外部リンクアイコンを共通表示し，CSS からリンク色を統一できる属性を付ける。
 * 補足説明（表示先など）は `tooltip` で渡す。ネイティブ title の代わりに
 * アプリ共通の shadcn Tooltip（暗色・角丸・即表示）で出し、見た目を統一する。
 */
export const ExternalLinkComponent = ({
  children,
  className = "",
  iconClassName = "size-3.5 shrink-0",
  tooltip,
  title,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  iconClassName?: string;
  /** 補足説明（表示先など）。shadcn Tooltip で表示される */
  tooltip?: ReactNode;
}) => {
  // shadcn Tooltip を使うときはネイティブ title を外し、二重表示を防ぐ
  const anchor = (
    <a
      target="_blank"
      rel="noopener noreferrer"
      data-external-link="true"
      className={cn("inline-flex items-center gap-1", className)}
      {...(tooltip ? props : { ...props, title })}
    >
      {children}
      <ExternalLink className={iconClassName} aria-hidden="true" />
    </a>
  );
  if (!tooltip) return anchor;
  return (
    <TooltipProvider delay={0}>
      <Tooltip>
        <TooltipTrigger render={anchor} />
        <TooltipContent className="break-words">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
