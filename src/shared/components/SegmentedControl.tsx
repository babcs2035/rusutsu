"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SegmentedOption<TValue extends string> = {
  value: TValue;
  label: ReactNode;
};

type Props<TValue extends string> = {
  options: readonly SegmentedOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  ariaLabel?: (option: SegmentedOption<TValue>) => string;
  /** 外枠の丸み。丸ピルか角丸か */
  radius?: "full" | "md";
  className?: string;
  /** 各ボタンに足すクラス。高さ・字送りだけを渡す */
  itemClassName?: string;
  /** 項目の間に区切り線を引くか */
  separators?: boolean;
};

/**
 * 塗りつぶしで選択中を示すセグメント切替。
 *
 * Button の既定は `border border-transparent` + `bg-clip-padding` なので、
 * そのまま並べると塗りの内側に 1px の透明な縁ができ、外枠の丸みと
 * 塗りの形がずれて見える。ここで枠を落とし、両端に外枠と同じ丸みを与えて
 * 「ボタンの形＝塗りの形」に揃える。
 */
export const SegmentedControl = <TValue extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  radius = "md",
  className,
  itemClassName,
  separators = false,
}: Props<TValue>) => (
  <div
    className={cn(
      "flex shrink-0 border border-gray-200 bg-white",
      radius === "full" ? "rounded-full" : "rounded-md",
      // 隙間を 1px あけて、その下の地の色を区切り線として見せる。
      // ボタン側に border を足すと、選択中の塗りの形が枠のぶんだけずれる
      separators && "gap-px bg-gray-300",
      className,
    )}
  >
    {options.map((option, index) => {
      const isActive = value === option.value;
      const isFirst = index === 0;
      const isLast = index === options.length - 1;
      const edgeRadius = radius === "full" ? "rounded-full" : "rounded-[5px]";

      return (
        <Button
          key={option.value}
          type="button"
          aria-label={ariaLabel?.(option)}
          aria-pressed={isActive}
          variant={isActive ? "default" : "ghost"}
          className={cn(
            "min-w-0 rounded-none border-0 font-semibold",
            // 端だけ外枠に合わせて丸める。枠線 1px ぶん内側なので半径も 1px 小さい
            isFirst &&
              (radius === "full" ? "rounded-l-full" : "rounded-l-[5px]"),
            isLast &&
              (radius === "full" ? "rounded-r-full" : "rounded-r-[5px]"),
            options.length === 1 && edgeRadius,
            !isActive &&
              "bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            itemClassName,
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      );
    })}
  </div>
);
