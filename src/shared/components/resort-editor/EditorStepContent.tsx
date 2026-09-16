import type { ReactNode } from "react";

/** 内容を縮めず、共通ツールを除いた残りの高さの中で末尾までスクロールする。 */
export function EditorStepContent({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-gray-50"
      data-editor-step-scroll
    >
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 p-3 sm:p-6 [&>*]:shrink-0">
        {children}
      </div>
    </div>
  );
}
