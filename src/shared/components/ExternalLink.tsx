import { ExternalLink } from "lucide-react";
import type { AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * 外部サイトへのリンク。`target="_blank" rel="noopener noreferrer"` を自動付与。
 *
 * 外部リンクアイコンを共通表示し，CSS からリンク色を統一できる属性を付ける。
 */
export const ExternalLinkComponent = ({
  children,
  className = "",
  iconClassName = "size-3.5 shrink-0",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { iconClassName?: string }) => (
  <a
    target="_blank"
    rel="noopener noreferrer"
    data-external-link="true"
    className={cn("inline-flex items-center gap-1", className)}
    {...props}
  >
    {children}
    <ExternalLink className={iconClassName} aria-hidden="true" />
  </a>
);
