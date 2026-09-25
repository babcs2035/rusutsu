"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TicketDocument, TicketEditDraft } from "../types";

const DRAFT_STORAGE_PREFIX = "rusutsu.ticket.draft.";

const draftKey = (resortId: string, seasonId: string): string =>
  `${DRAFT_STORAGE_PREFIX}${resortId}/${seasonId}`;

export const loadDraft = (
  resortId: string,
  seasonId: string,
): TicketEditDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(resortId, seasonId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TicketEditDraft;
    if (parsed?.version !== 2 || typeof parsed.data !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const discardDraft = (resortId: string, seasonId: string): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(resortId, seasonId));
};

type DraftStorageState = {
  savedAt: string | null;
  markSavedToServer: () => void;
  discard: () => void;
};

/**
 * 編集内容をスキー場×シーズン単位でローカルストレージへ自動保存する。
 * サーバーへ保存する前にタブを閉じても失われないようにするためで、
 * 検証を通っていない状態を本番DBへ書かないという方針とは両立する。
 */
export const useDraftStorage = (
  resortId: string | null,
  seasonId: string | null,
  baseVersion: number | null,
  data: TicketDocument | null,
  enabled: boolean,
): DraftStorageState => {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    skipNextSaveRef.current = true;
    if (!resortId || !seasonId) {
      setSavedAt(null);
      return;
    }
    setSavedAt(loadDraft(resortId, seasonId)?.updatedAt ?? null);
  }, [resortId, seasonId]);

  useEffect(() => {
    if (!enabled || !resortId || !seasonId || !data || baseVersion === null)
      return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const updatedAt = new Date().toISOString();
      const draft: TicketEditDraft = {
        version: 2,
        resortId,
        seasonId,
        baseVersion,
        data,
        updatedAt,
      };
      try {
        window.localStorage.setItem(
          draftKey(resortId, seasonId),
          JSON.stringify(draft),
        );
        setSavedAt(updatedAt);
      } catch {
        // 容量超過などで保存できない場合は最終保存時刻を更新しない
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [enabled, resortId, seasonId, baseVersion, data]);

  const markSavedToServer = useCallback(() => {
    if (!resortId || !seasonId) return;
    discardDraft(resortId, seasonId);
    setSavedAt(null);
    skipNextSaveRef.current = true;
  }, [resortId, seasonId]);

  const discard = useCallback(() => {
    if (!resortId || !seasonId) return;
    discardDraft(resortId, seasonId);
    setSavedAt(null);
    skipNextSaveRef.current = true;
  }, [resortId, seasonId]);

  return { savedAt, markSavedToServer, discard };
};
