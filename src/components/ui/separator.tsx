"use client";

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        // base-ui Separator は data-orientation="horizontal|vertical" 属性のみを付与する
        // （旧 Radix 系の data-horizontal/data-vertical 属性は存在しないため，それらを参照する
        // バリアントは常に非一致の死クラスになる）。orientation 値にマッチする
        // data-[orientation=...] 形式にしないと寸法クラスが効かず separator が不可視になる
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
