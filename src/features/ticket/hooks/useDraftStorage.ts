"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TicketDocument, TicketEditDraft } from "../types";

const DRAFT_STORAGE_PREFIX = "rusutsu.ticket.draft.";

const draftKey = (resortId: string, fileName: string): string =>
  `${DRAFT_STORAGE_PREFIX}${resortId}/${fileName}`;

export const loadDraft = (
  resortId: string,
  fileName: string,
): TicketEditDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(resortId, fileName));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TicketEditDraft;
    if (parsed?.version !== 1 || typeof parsed.data !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const discardDraft = (resortId: string, fileName: string): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(resortId, fileName));
};

type DraftStorageState = {
  savedAt: string | null;
  markSavedToServer: () => void;
  discard: () => void;
};

/**
 * 編集内容をファイル単位でローカルストレージへ自動保存する。
 * サーバーへ保存する前にタブを閉じても失われないようにするためで、
 * 検証を通っていない状態を本番ファイルへ書かないという方針とは両立する。
 */
export const useDraftStorage = (
  resortId: string | null,
  fileName: string | null,
  fileHash: string | null,
  data: TicketDocument | null,
  enabled: boolean,
): DraftStorageState => {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    skipNextSaveRef.current = true;
    if (!resortId || !fileName) {
      setSavedAt(null);
      return;
    }
    setSavedAt(loadDraft(resortId, fileName)?.updatedAt ?? null);
  }, [resortId, fileName]);

  useEffect(() => {
    if (!enabled || !resortId || !fileName || !data || !fileHash) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const updatedAt = new Date().toISOString();
      const draft: TicketEditDraft = {
        version: 1,
        resortId,
        fileName,
        fileHash,
        data,
        updatedAt,
      };
      try {
        window.localStorage.setItem(
          draftKey(resortId, fileName),
          JSON.stringify(draft),
        );
        setSavedAt(updatedAt);
      } catch {
        // 容量超過などで保存できない場合は最終保存時刻を更新しない
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [enabled, resortId, fileName, fileHash, data]);

  const markSavedToServer = useCallback(() => {
    if (!resortId || !fileName) return;
    discardDraft(resortId, fileName);
    setSavedAt(null);
    skipNextSaveRef.current = true;
  }, [resortId, fileName]);

  const discard = useCallback(() => {
    if (!resortId || !fileName) return;
    discardDraft(resortId, fileName);
    setSavedAt(null);
    skipNextSaveRef.current = true;
  }, [resortId, fileName]);

  return { savedAt, markSavedToServer, discard };
};
