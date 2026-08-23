"use client";

import type { FormEvent, ReactNode } from "react";

// 内容（pt 0.625rem + h-12 + pb-2 = 66px）と一致させる
export const MOBILE_SEARCH_TOP_BAR_HEIGHT =
  "calc(env(safe-area-inset-top, 0px) + 4.125rem)";

type Props = {
  action: ReactNode;
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLElement>) => void;
};

export const MobileSearchTopBarShell = ({
  action,
  children,
  onSubmit,
}: Props) => {
  // モバイル専用シェル（親が hide-desktop）のため md:hidden で隠す
  const baseClasses =
    "box-border h-[calc(env(safe-area-inset-top,0px)+4.125rem)] bg-white px-4 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] pb-2 md:hidden";

  if (onSubmit) {
    return (
      <form
        className={baseClasses}
        noValidate
        onSubmit={e => {
          e.preventDefault();
          onSubmit(e as unknown as FormEvent<HTMLElement>);
        }}
      >
        <div className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-2.5">
          <div className="min-w-0">{children}</div>
          {action}
        </div>
      </form>
    );
  }

  return (
    <div className={baseClasses}>
      <div className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-2.5">
        <div className="min-w-0">{children}</div>
        {action}
      </div>
    </div>
  );
};
