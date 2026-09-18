"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResortEditorLinkDraft } from "@/shared/components/resort-editor/useResortEditorLinks";
import { hasLinkDraftChanges } from "@/shared/utils/editorDraft";
import { loadLiftSourceData } from "../actions";
import { DRAFT_STORAGE_PREFIX } from "../constants";
import type { DraftSummary, EditorLift, LiftEditDraft } from "../types";
import { liftDraftContentKey } from "../utils/draftContent";
import { sourceDataToLifts } from "../utils/loadSource";

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

export const listDraftSummaries = async (): Promise<DraftSummary[]> => {
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
  const changed: DraftSummary[] = [];
  for (const summary of summaries) {
    const draft = loadDraft(summary.resortId);
    if (!draft) continue;
    try {
      const source = await loadLiftSourceData(summary.resortId);
      const baseline = sourceDataToLifts(summary.resortId, source);
      if (
        liftDraftContentKey(draft.lifts) ===
          liftDraftContentKey(baseline.lifts) &&
        !hasLinkDraftChanges(draft.linkDraft)
      ) {
        // 読み込み中に別タブで更新された下書きは削除しない。
        if (
          JSON.stringify(loadDraft(summary.resortId)) === JSON.stringify(draft)
        ) {
          discardDraft(summary.resortId);
          continue;
        }
      }
    } catch {
      // 正本を確認できない場合は編集内容を残す。
    }
    changed.push(summary);
  }
  return changed;
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
  baseline: string,
  linkDraft?: ResortEditorLinkDraft,
): DraftStorageState => {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const contentKey = liftDraftContentKey(lifts);
  const hasChanges = contentKey !== baseline || hasLinkDraftChanges(linkDraft);

  useEffect(() => {
    if (!resortId) {
      setSavedAt(null);
      return;
    }
    setSavedAt(loadDraft(resortId)?.updatedAt ?? null);
  }, [resortId]);

  useEffect(() => {
    if (!enabled || !resortId) return;
    if (!hasChanges) {
      discardDraft(resortId);
      setSavedAt(null);
      return;
    }
    const updatedAt = new Date().toISOString();
    const draft: LiftEditDraft = {
      linkDraft,
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
  }, [enabled, hasChanges, resortId, fileHash, lifts, linkDraft]);

  const markSavedToServer = useCallback(() => {
    // サーバーへ保存できたら下書きは不要になるため破棄する
    if (!resortId) return;
    discardDraft(resortId);
    setSavedAt(null);
  }, [resortId]);

  const discard = useCallback(() => {
    if (!resortId) return;
    discardDraft(resortId);
    setSavedAt(null);
  }, [resortId]);

  return { savedAt: hasChanges ? savedAt : null, markSavedToServer, discard };
};
