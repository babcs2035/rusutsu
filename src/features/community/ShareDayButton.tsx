"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { dayReportsPath, shareTargets } from "./dayShare";

/**
 * 1日分の現地レポートのページをSNSで共有する。
 * スマホなど共有メニューのある端末ではそれを開き、ない端末（PC）では共有先を並べる。
 */
export function ShareDayButton({
  authorId,
  observedOn,
  text,
  label = "共有",
  className,
}: {
  authorId: string;
  observedOn: string;
  /** SNSへ渡す文（リンクは別に付く） */
  text: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  const share = async () => {
    const target = `${window.location.origin}/rusutsu${dayReportsPath(authorId, observedOn)}`;
    setUrl(target);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url: target });
        return;
      } catch (error) {
        // 共有メニューを閉じただけなら何もしない
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    setCopied(false);
    setOpen(true);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-label="この日のレポートを共有"
        className={cn(
          "h-8 shrink-0 gap-1 rounded-md border-gray-300 bg-white px-2 text-xs font-semibold whitespace-nowrap text-gray-700",
          className,
        )}
        onClick={() => void share()}
      >
        <Share2 className="size-3.5" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="z-[1000] gap-3" overlayClassName="z-[999]">
          <DialogTitle>この日のレポートを共有</DialogTitle>
          <DialogDescription className="break-words text-xs text-gray-600">
            {text}
          </DialogDescription>
          <div className="grid grid-cols-3 gap-2">
            {shareTargets(url, text).map(target => (
              <a
                key={target.id}
                href={target.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white text-sm font-semibold whitespace-nowrap text-gray-800 hover:bg-gray-50"
              >
                {target.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label="共有するリンク"
              value={url}
              className="h-9 min-w-0 flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700"
              onFocus={event => event.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 gap-1 px-2.5 text-xs font-semibold whitespace-nowrap"
              onClick={() => void copy()}
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-600" />
              ) : (
                <Link2 className="size-3.5" />
              )}
              {copied ? "コピーしました" : "リンクをコピー"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
