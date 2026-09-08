"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

export function AdminWorkspaceSidebar({
  children,
  selectionKey,
  label,
  className,
}: {
  children: ReactNode;
  selectionKey: string | null;
  label: string;
  className: string;
}) {
  const [open, setOpen] = useState(!selectionKey);
  const contentId = useId();
  useEffect(() => {
    if (selectionKey) setOpen(false);
  }, [selectionKey]);

  return (
    <aside
      className={cn(
        "flex min-h-0 shrink-0 flex-col bg-[var(--sidebar-dark)] text-white max-md:w-full",
        className,
      )}
    >
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm font-semibold md:hidden"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(value => !value)}
      >
        {label}
        <ChevronDown className={cn("size-4 shrink-0", open && "rotate-180")} />
      </button>
      <div
        id={contentId}
        className={cn(
          "min-h-0 overflow-y-auto md:block md:flex-1",
          open ? "max-md:max-h-[40dvh]" : "hidden",
        )}
      >
        {children}
      </div>
    </aside>
  );
}
