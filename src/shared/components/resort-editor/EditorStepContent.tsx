import type { ReactNode } from "react";

/** 内容を縮めず、共通ツールと一緒にパネル全体でスクロールする。 */
export function EditorStepContent({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1 shrink-0 bg-gray-50">
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 p-3 sm:p-6 [&>*]:shrink-0">
        {children}
      </div>
    </div>
  );
}
