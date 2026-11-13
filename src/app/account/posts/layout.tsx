import type { ReactNode } from "react";

// 単独ページでもスクロールできるよう、community と同じ枠で包む
export default function AccountPostsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="h-dvh min-h-0 overflow-y-auto overscroll-contain">
      {children}
    </div>
  );
}
