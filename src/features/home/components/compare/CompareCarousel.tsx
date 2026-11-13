"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 横スワイプで 1 画面 1 スキー場を送る並びに付けるクラス（スクロールする枠） */
export const COMPARE_CAROUSEL_TRACK_CLASS =
  "scroll-touch flex min-h-0 w-full flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden";

/** 並びの 1 画面分に付けるクラス */
export const COMPARE_CAROUSEL_PAGE_CLASS =
  "h-full w-full min-w-full snap-center px-0.5";

/**
 * 比較（スマホ）の 1 画面 1 スキー場の横スワイプ。ゲレンデとリンク集で同じ動きにする。
 * scrollRef と onScroll をスクロールする枠に付けると、表示中の位置が分かる。
 */
export const useCompareCarousel = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element || element.clientWidth === 0) return;

    const index = Math.round(element.scrollLeft / element.clientWidth);
    setActiveIndex(previous => (previous === index ? previous : index));
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const element = scrollRef.current;
    if (!element) return;

    element.scrollTo({ left: index * element.clientWidth, behavior: "smooth" });
  }, []);

  return { activeIndex, scrollRef, handleScroll, scrollToIndex };
};

/** 並びの下に置く、前後の送りボタンと位置の点。1 件だけなら出さない */
export const CompareCarouselPager = ({
  ids,
  activeIndex,
  onIndexChange,
}: {
  ids: string[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
}) => {
  if (ids.length <= 1) return null;
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 py-2">
      <Button
        type="button"
        variant="ghost"
        aria-label="前のスキー場"
        disabled={activeIndex === 0}
        onClick={() => onIndexChange(activeIndex - 1)}
        className="h-8 w-8 min-w-8 rounded-full p-0 text-gray-500"
      >
        <ChevronLeft size={18} />
      </Button>
      <div className="flex items-center gap-1.5">
        {ids.map((id, index) => (
          <span
            key={id}
            className={cn(
              "h-1.5 rounded-full transition-all",
              index === activeIndex ? "w-4 bg-blue-600" : "w-1.5 bg-gray-300",
            )}
          />
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        aria-label="次のスキー場"
        disabled={activeIndex === ids.length - 1}
        onClick={() => onIndexChange(activeIndex + 1)}
        className="h-8 w-8 min-w-8 rounded-full p-0 text-gray-500"
      >
        <ChevronRight size={18} />
      </Button>
    </div>
  );
};
