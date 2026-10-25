import type { ReactNode } from "react";
export default function CommunityLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh min-h-0 overflow-y-auto overscroll-contain">
      {children}
    </div>
  );
}
