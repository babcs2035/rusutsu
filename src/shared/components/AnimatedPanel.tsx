"use client";

import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";

/**
 * CSS transition によるフェードイン/スライドアニメーションを提供するパネル。
 * framer-motion の `motion.div` + variants に代わる軽量実装。
 */
type AnimatedPanelProps = {
  children: ReactNode;
  /** アニメーション対象のルート要素の className */
  rootClassName?: string;
  /** アニメーション対象のコンテンツ要素の className */
  contentClassName?: string;
  /** アニメーション方向: x-axis のスライド距離 (px) */
  slideOffset?: number;
  /** アニメーションduration (ms) */
  duration?: number;
  /**
   * アニメーションの種類。
   * - "slide": 右からスライドイン（サイドパネル用）
   * - "fade": 透明度のみ変化（画面中央のモーダル用。スライドだと中央配置と不自然に映るため）
   */
  animation?: "slide" | "fade";
  /** 現在表示中かどうか */
  visible: boolean;
  style?: CSSProperties;
} & Omit<ComponentProps<"div">, "children" | "style">;

export function AnimatedPanel({
  children,
  rootClassName = "",
  contentClassName = "",
  slideOffset = 24,
  duration = 180,
  animation = "slide",
  visible,
  style,
  ...rest
}: AnimatedPanelProps) {
  const [animating, setAnimating] = useState(visible);

  useEffect(() => {
    if (visible !== animating) {
      setAnimating(visible);
    }
  }, [visible, animating]);

  return (
    <div {...rest} className={rootClassName} style={style}>
      <div
        className={contentClassName}
        style={
          {
            "--panel-slide": visible ? "0px" : `${slideOffset}px`,
            "--panel-opacity": visible ? "1" : "0",
            transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
            opacity: "var(--panel-opacity)",
            // fade 時は translateX を使わない（中央モーダル用）
            transform:
              animation === "fade" ? "none" : "translateX(var(--panel-slide))",
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
