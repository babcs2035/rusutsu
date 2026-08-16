import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * 外部サイトへのリンク。`target="_blank" rel="noopener noreferrer"` を自動付与。
 *
 * `icon` を渡すとリンクテキストの後に外部リンクアイコンが表示される。
 * `iconPosition="start"` にすると前に表示。
 */
export const ExternalLinkComponent = ({
  children,
  icon,
  iconPosition = "end",
  className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  icon?: ReactNode;
  iconPosition?: "start" | "end";
}) => (
  <a
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex items-center gap-1 ${className}`}
    {...props}
  >
    {iconPosition === "start" && icon}
    {children}
    {iconPosition === "end" && icon}
  </a>
);
