"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { NamedGeometry } from "../utils/editedRows";
import { mappingProceedWarnings } from "../utils/proceedWarnings";
import type { LatestStatusMappingState } from "./useLatestStatusMapping";

export function useMappingProceedGuard(
  items: NamedGeometry[],
  mapping: LatestStatusMappingState,
) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const loading = mapping.isLoading;
  const unavailable = !mapping.workspace || !!mapping.error;
  const warnings = mappingProceedWarnings(items, mapping);
  const proceed = (next: () => void) => {
    if (items.length > 0 && (loading || unavailable || warnings.length > 0)) {
      setPending(() => next);
    } else {
      next();
    }
  };

  const dialog = (
    <AlertDialog
      open={pending !== null}
      onOpenChange={open => !open && setPending(null)}
    >
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            クローラーとの対応を確認してください
          </AlertDialogTitle>
          <AlertDialogDescription>
            {loading
              ? "クローラーの対応を読み込み中です。完了するまでお待ちください。"
              : "クローラーの対応漏れや、誤った対応付けがないか確認してください。このまま次へ進んでも大丈夫ですか？"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!loading && (
          <div className="max-h-[50vh] overflow-y-auto text-sm text-amber-900">
            {unavailable ? (
              <p>
                クローラーの対応を確認できませんでした。編集画面で再読み込みしてください。
              </p>
            ) : (
              <ul className="list-disc space-y-2 pl-5">
                {[...new Set(warnings)].map(warning => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPending(null)}>
            編集に戻る
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={() => {
              const next = pending;
              setPending(null);
              next?.();
            }}
          >
            このまま進む
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { proceed, dialog };
}
