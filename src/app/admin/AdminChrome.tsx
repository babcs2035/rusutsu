"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * 画面いっぱいを使う編集画面のパス。
 * ここでは共通ヘッダーを出さず、地図と作業パネルに縦幅を全部渡す。
 */
const FULL_HEIGHT_PATHS = ["/admin/slope", "/admin/lift", "/admin/resort"];

export const isFullHeightAdminPath = (pathname: string): boolean =>
  FULL_HEIGHT_PATHS.some(
    path => pathname === path || pathname.startsWith(`${path}/`),
  );

/**
 * 管理画面の共通ヘッダーを出すかどうかを、パスで切り替える。
 *
 * ヘッダーはサーバー側で作って children として受け取る。ここでは
 * 出すか出さないかだけを決めるので、認証の呼び出しはサーバーのままにできる。
 */
export function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isFullHeightAdminPath(pathname)) return null;
  return <>{children}</>;
}
