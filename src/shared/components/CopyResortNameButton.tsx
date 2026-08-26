"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 権限などで Clipboard API が使えない場合は従来方式を試す。
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const succeeded = document.execCommand("copy");
  textarea.remove();

  if (!succeeded) {
    throw new Error("Copy command failed");
  }
};

export const CopyResortNameButton = ({
  name,
  className,
  onInteract,
}: {
  name: string;
  className?: string;
  onInteract?: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      await copyText(name);
      setCopied(true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const label = copied
    ? `${name}をコピーしました`
    : `${name}をクリップボードにコピー`;

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className={cn(
        "shrink-0 rounded-md text-gray-400 hover:bg-blue-50 hover:text-blue-600",
        copied &&
          "bg-green-50 text-green-600 hover:bg-green-50 hover:text-green-600",
        className,
      )}
      aria-label={label}
      title={copied ? "コピーしました" : "スキー場名をコピー"}
      onPointerDown={event => {
        event.stopPropagation();
        onInteract?.();
      }}
      onKeyDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        void handleCopy();
      }}
    >
      {copied ? (
        <Check className="size-3.5" strokeWidth={2.75} />
      ) : (
        <Copy className="size-3.5" strokeWidth={2.25} />
      )}
    </Button>
  );
};
