"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { Submission } from "@/server/edit-requests/contract";

/** 申請結果を直接保存と取り違えず、ページ内の移動で申請履歴を開く。 */
export function useSubmissionNavigation() {
  const router = useRouter();
  return useCallback(
    (result: unknown): boolean => {
      if (!result || typeof result !== "object" || !("submission" in result))
        return false;
      const submission = result.submission as Submission | undefined;
      if (!submission?.requestId) return false;
      router.push(
        `/admin/requests/${encodeURIComponent(submission.requestId)}`,
      );
      return true;
    },
    [router],
  );
}
