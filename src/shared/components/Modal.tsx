"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ReactElement, ReactNode } from "react";
import {
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DialogCloseButton } from "./DialogCloseButton";

/**
 * 標準的なモーダル（ダイアログ）。デザイン・スタイリング・仕様の統一に使う。
 *
 * - 背景は暗くせず，ややブラー（DialogOverlay 共通）
 * - 外側クリック，Esc，閉じるボタンのいずれでも閉じる（Base UI の既定挙動）
 * - 閉じるボタンは常に DialogCloseButton で出す
 * - 本体は白カード（rounded-xl，border，shadow）で最大高さ 85dvh，超高い場合は内部スクロール
 *
 * 使い方:
 * - トリガー付き: `trigger` にボタンを渡す（非制御）
 * - 制御: `open` と `onOpenChange` を渡す（トリガーは外側で出す）
 *
 * 詳細パネル内に制約して出す特殊なモーダル（雪マジ・EV充電）はこの制約のため
 * 個別実装だが，DialogCloseButton と DialogOverlay は共通にする。
 */
export function Modal({
  trigger,
  open,
  onOpenChange,
  title,
  titleClassName,
  children,
  className,
  closeLabel = "閉じる",
}: {
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  titleClassName?: string;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger render={trigger} /> : null}
      <DialogPortal>
        <DialogOverlay className="z-[900]" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed left-1/2 top-1/2 z-[901] max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-4 text-slate-700 shadow-xl outline-none",
            className,
          )}
        >
          <DialogTitle
            className={cn(
              "pr-8 text-base font-semibold text-slate-900",
              titleClassName,
            )}
          >
            {title}
          </DialogTitle>
          <DialogCloseButton label={closeLabel} />
          {children}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
