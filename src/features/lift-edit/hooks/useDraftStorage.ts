"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DRAFT_STORAGE_PREFIX } from "../constants";
import type { DraftSummary, EditorLift, LiftEditDraft } from "../types";

const draftKey = (resortId: string): string =>
  `${DRAFT_STORAGE_PREFIX}${resortId}`;

export const loadDraft = (resortId: string): LiftEditDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(resortId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiftEditDraft;
    if (parsed?.version !== 1 || !Array.isArray(parsed.lifts)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const discardDraft = (resortId: string): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(resortId));
};

export const listDraftSummaries = (): DraftSummary[] => {
  if (typeof window === "undefined") return [];
  const summaries: DraftSummary[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(DRAFT_STORAGE_PREFIX)) continue;
    const resortId = key.slice(DRAFT_STORAGE_PREFIX.length);
    const draft = loadDraft(resortId);
    if (draft) {
      summaries.push({
        resortId,
        updatedAt: draft.updatedAt,
        liftCount: draft.lifts.filter(lift => !lift.isDeleted).length,
      });
    }
  }
  return summaries;
};

type DraftStorageState = {
  savedAt: string | null;
  markSavedToServer: () => void;
  discard: () => void;
};

// スキー場IDごとに編集内容をローカルストレージへ自動保存する
export const useDraftStorage = (
  resortId: string | null,
  fileHash: string | null,
  lifts: EditorLift[],
  enabled: boolean,
): DraftStorageState => {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    skipNextSaveRef.current = true;
    if (!resortId) {
      setSavedAt(null);
      return;
    }
    setSavedAt(loadDraft(resortId)?.updatedAt ?? null);
  }, [resortId]);

  useEffect(() => {
    if (!enabled || !resortId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const updatedAt = new Date().toISOString();
      const draft: LiftEditDraft = {
        version: 1,
        resortId,
        fileHash,
        lifts,
        updatedAt,
        savedToServerAt: null,
      };
      try {
        window.localStorage.setItem(draftKey(resortId), JSON.stringify(draft));
        setSavedAt(updatedAt);
      } catch {
        // 容量超過などで保存できない場合は最終保存時刻を更新しない
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [enabled, resortId, fileHash, lifts]);

  const markSavedToServer = useCallback(() => {
    // サーバーへ保存できたら下書きは不要になるため破棄する
    if (!resortId) return;
    discardDraft(resortId);
    setSavedAt(null);
    skipNextSaveRef.current = true;
  }, [resortId]);

  const discard = useCallback(() => {
    if (!resortId) return;
    discardDraft(resortId);
    setSavedAt(null);
    skipNextSaveRef.current = true;
  }, [resortId]);

  return { savedAt, markSavedToServer, discard };
};
