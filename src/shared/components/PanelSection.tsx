"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PanelSectionProps = {
  title: ReactNode;
  children: ReactNode;
  /** 開閉の状態を覚えておくキー。指定しなければ覚えない */
  storageKey?: string;
  defaultOpen?: boolean;
  /** 見出しの右端に出す要約（閉じていても見える） */
  summary?: ReactNode;
  className?: string;
  tone?: "default" | "info";
};

const readStoredOpen = (key: string): boolean | null => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : raw === "1";
  } catch {
    return null;
  }
};

/**
 * 折りたためる小見出し付きの箱。
 *
 * 説明やクロール結果を常に開いておくと、肝心の一覧の高さが足りなくなる。
 * 使うときだけ開けるようにして、開けたかどうかは次回も引き継ぐ。
 */
export function PanelSection({
  title,
  children,
  storageKey,
  defaultOpen = false,
  summary,
  className,
  tone = "default",
}: PanelSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    const stored = readStoredOpen(storageKey);
    if (stored !== null) setIsOpen(stored);
  }, [storageKey]);

  const toggle = () => {
    setIsOpen(current => {
      const next = !current;
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          // 覚えられなくても開閉そのものは動く
        }
      }
      return next;
    });
  };

  return (
    <section
      className={cn(
        "shrink-0 overflow-hidden rounded-lg border",
        tone === "info"
          ? "border-primary/20 bg-primary/5"
          : "border-border bg-card",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-h-10 w-full justify-start gap-2 rounded-none px-3 py-2 text-left whitespace-normal"
        aria-expanded={isOpen}
        onClick={toggle}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 text-sm font-semibold">{title}</span>
        {summary && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            {summary}
          </span>
        )}
      </Button>
      {isOpen && (
        <div className="border-t border-border px-3 py-3">{children}</div>
      )}
    </section>
  );
}
