"use client";

import useMediaQuery from "./use-media-query";

type BreakpointValue<T> = {
  base?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  "2xl"?: T;
};

/**
 * Tailwind のブレークポイントに合わせて値を返すフック。
 */
export function useBreakpointValue<T>(values: BreakpointValue<T>): T {
  const [isSm] = useMediaQuery("(min-width: 640px)"); // sm
  const [isMd] = useMediaQuery("(min-width: 768px)"); // md
  const [isLg] = useMediaQuery("(min-width: 1024px)"); // lg
  const [isXl] = useMediaQuery("(min-width: 1280px)"); // xl
  const [is2xl] = useMediaQuery("(min-width: 1536px)"); // 2xl

  if (is2xl)
    return (values["2xl"] ??
      values.xl ??
      values.lg ??
      values.md ??
      values.sm ??
      values.base) as T;
  if (isXl)
    return (values.xl ??
      values.lg ??
      values.md ??
      values.sm ??
      values.base) as T;
  if (isLg) return (values.lg ?? values.md ?? values.sm ?? values.base) as T;
  if (isMd) return (values.md ?? values.sm ?? values.base) as T;
  if (isSm) return (values.sm ?? values.base) as T;
  return (values.base ?? null) as T;
}

export default useBreakpointValue;
