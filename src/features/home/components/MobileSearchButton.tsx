"use client";

import { Search, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  keyword: string;
  onKeywordClear: () => void;
  onOpen: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

// トップバー内（静的配置）でのみ使用されるため，配置は固定
export const MobileSearchButton = ({
  keyword,
  onKeywordClear,
  onOpen,
  onPointerDown,
}: Props) => (
  <div className="flex md:hidden w-full min-w-0 pointer-events-auto relative">
    <Button
      type="button"
      aria-label="スキー場を検索"
      variant="ghost"
      className={`relative z-10 flex justify-start w-full h-12 pl-10 ${
        keyword ? "pr-10" : "pr-3"
      } rounded-full border border-gray-200 bg-white ${
        keyword ? "text-gray-700" : "text-gray-500"
      } text-base font-medium shadow-[0_10px_30px_rgba(15,23,42,0.12)] pointer-events-auto hover:bg-gray-50 hover:text-gray-900`}
      onPointerDown={onPointerDown}
      onClick={onOpen}
    >
      <div className="absolute left-[14px] top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
        <Search size={18} />
      </div>
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {keyword || "スキー場を検索"}
      </span>
    </Button>
    {keyword && (
      <Button
        type="button"
        aria-label="検索キーワードをクリア"
        variant="ghost"
        className="absolute top-1/2 right-[6px] z-20 -translate-y-1/2 w-8 h-8 min-w-8 p-0 rounded-full border border-gray-200 bg-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation();
          onKeywordClear();
        }}
      >
        <X size={18} strokeWidth={2.5} />
      </Button>
    )}
  </div>
);
