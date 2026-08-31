"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** 説明の 1 行。label は行頭に太字で出す小見出し */
export type GuidePoint = { label?: string; text: string };

export type GuidePage = {
  id: string;
  title: string;
  lead: string;
  illustration?: ReactNode;
  points: GuidePoint[];
  /** 覚えなくてよい細かい話 */
  note?: string;
};

export type GuideShortcut = { keys: string; description: string };

type GuideDialogProps = {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
  title: string;
  description: string;
  pages: GuidePage[];
  shortcuts: GuideShortcut[];
};

/**
 * はじめて使う人向けの手引き。
 *
 * 文章を並べただけの一覧は、読む前に諦められてしまう。1 画面 1 話題に切り、
 * 操作は動く図で見せて、キーボード操作は最後に表でまとめる。
 * 「次回から表示しない」を明示のチェックにして、いつでも読み返せるようにする。
 */
export function GuideDialog({
  open,
  onClose,
  title,
  description,
  pages,
  shortcuts,
}: GuideDialogProps) {
  const lastIndex = pages.length;
  const [index, setIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);

  // 開き直したときは最初のページから読み始められるようにする
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const isShortcutPage = index === lastIndex;
  const page = pages[index];
  const dotIds = [...pages.map(item => item.id), "shortcuts"];

  const go = (delta: number) =>
    setIndex(current => Math.min(Math.max(current + delta, 0), lastIndex));

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose(dontShowAgain)}>
      <DialogContent
        className="flex max-h-[86vh] w-[min(680px,94vw)] max-w-[680px] flex-col gap-3 sm:max-w-[680px]"
        onKeyDown={event => {
          if (event.key === "ArrowRight") go(1);
          if (event.key === "ArrowLeft") go(-1);
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {isShortcutPage ? (
            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-sm">キーボード操作のまとめ</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="w-[38%] py-1 font-medium">キー</th>
                    <th className="py-1 font-medium">はたらき</th>
                  </tr>
                </thead>
                <tbody>
                  {shortcuts.map(shortcut => (
                    <tr
                      key={shortcut.keys}
                      className="border-b last:border-b-0"
                    >
                      <td className="py-1.5 pr-2 align-top">
                        <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px]">
                          {shortcut.keys}
                        </kbd>
                      </td>
                      <td className="py-1.5 align-top text-gray-700">
                        {shortcut.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-gray-500">
                この手引きは、画面右上の「使い方」からいつでも開けます。
              </p>
            </div>
          ) : (
            page && (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <h3 className="font-bold text-sm">{page.title}</h3>
                </div>
                <p className="text-xs leading-relaxed text-gray-700">
                  {page.lead}
                </p>
                {page.illustration}
                <ul className="flex flex-col gap-1.5">
                  {page.points.map(point => (
                    <li
                      key={`${point.label ?? ""}${point.text}`}
                      className="flex gap-1.5 text-xs leading-relaxed text-gray-700"
                    >
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-gray-400" />
                      <span className="min-w-0">
                        {point.label && (
                          <span className="font-bold">{point.label}: </span>
                        )}
                        {point.text}
                      </span>
                    </li>
                  ))}
                </ul>
                {page.note && (
                  <p className="rounded-md bg-gray-50 px-2 py-1.5 text-[11px] leading-relaxed text-gray-600">
                    {page.note}
                  </p>
                )}
              </div>
            )
          )}
        </div>

        <div className="flex items-center justify-center gap-1">
          {dotIds.map((dotId, dotIndex) => (
            <button
              key={dotId}
              type="button"
              aria-label={`${dotIndex + 1} ページ目へ`}
              aria-current={dotIndex === index}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                dotIndex === index
                  ? "w-4 bg-blue-600"
                  : "bg-gray-300 hover:bg-gray-400",
              )}
              onClick={() => setIndex(dotIndex)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={checked => setDontShowAgain(checked === true)}
            />
            次回から自動で開かない
          </label>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            disabled={index === 0}
            onClick={() => go(-1)}
          >
            <ChevronLeft className="size-3.5" />
            前へ
          </Button>
          {index < lastIndex ? (
            <Button size="sm" onClick={() => go(1)}>
              次へ
              <ChevronRight className="size-3.5" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => onClose(dontShowAgain)}>
              はじめる
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
