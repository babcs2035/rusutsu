"use client";

import type { FormEvent, ReactNode } from "react";
import { AccountButton } from "@/features/favorites/AccountButton";
import { cn } from "@/lib/utils";

// 内容（pt 0.625rem + h-12 + pb-2 = 66px）と一致させる
export const MOBILE_SEARCH_TOP_BAR_HEIGHT =
  "calc(env(safe-area-inset-top, 0px) + 4.125rem)";

type Props = {
  action: ReactNode;
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLElement>) => void;
  floating?: boolean;
  showAccount?: boolean;
};

export const MobileSearchTopBarShell = ({
  action,
  children,
  onSubmit,
  floating = false,
  showAccount = false,
}: Props) => {
  // モバイル専用シェル（親が hide-desktop）のため md:hidden で隠す
  const baseClasses = cn(
    "box-border h-[calc(env(safe-area-inset-top,0px)+4.125rem)] px-4 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] pb-2 md:hidden",
    floating ? "pointer-events-none" : "bg-white",
  );
  const gridClasses = cn(
    "grid w-full items-center gap-2.5 [&>*]:pointer-events-auto",
    showAccount
      ? "grid-cols-[minmax(0,1fr)_auto_auto]"
      : "grid-cols-[minmax(0,1fr)_auto]",
  );

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
        <div className={gridClasses}>
          <div className="min-w-0">{children}</div>
          {action}
          {showAccount && <AccountButton />}
        </div>
      </form>
    );
  }

  return (
    <div className={baseClasses}>
      <div className={gridClasses}>
        <div className="min-w-0">{children}</div>
        {action}
        {showAccount && <AccountButton />}
      </div>
    </div>
  );
};
