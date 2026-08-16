"use client";

import { Toaster, toast } from "sonner";

/**
 * 管理画面用の Toast 通知
 *
 * 使い方の例:
 * ```tsx
 * import { adminToaster } from "@/app/admin/AdminToaster"
 * adminToaster.create({ title: "保存しました" })
 * ```
 */
export const adminToaster = {
  create: (options: {
    title?: string;
    description?: string;
    type?: "success" | "error" | "warning" | "info";
  }) => {
    const { title, description, type = "info" } = options;
    switch (type) {
      case "success":
        toast.success(title ?? "");
        break;
      case "error":
        toast.error(title ?? "");
        break;
      case "warning":
        toast.warning(title ?? "");
        break;
      default:
        toast(title ?? "");
    }
    if (description) {
      toast(description);
    }
  },
};

/**
 * 管理画面用の Toaster コンポーネント
 *
 * layout.tsx でインポートして使用してください:
 * ```tsx
 * import { AdminToaster } from "@/app/admin/AdminToaster"
 * // ...
 * <AdminToaster />
 * ```
 */
export function AdminToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        className: "w-[380px] max-w-full rounded-lg px-4 py-3",
      }}
    />
  );
}
