"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DRAFT_STORAGE_PREFIX } from "../constants";
import type {
  DraftSummary,
  EditorCourse,
  SlopeBeforeFeature,
  SlopeDetailEntry,
  SlopeEditDraft,
  SlopeSourceKind,
} from "../types";

const draftKey = (resortId: string, sourceKind: SlopeSourceKind): string =>
  `${DRAFT_STORAGE_PREFIX}${sourceKind}:${resortId}`;

const legacyDraftKey = (resortId: string): string =>
  `${DRAFT_STORAGE_PREFIX}${resortId}`;

const parseDraft = (raw: string | null): SlopeEditDraft | null => {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as SlopeEditDraft;
  if (parsed?.version !== 1 || !Array.isArray(parsed.courses)) return null;
  return parsed;
};

const removeMatchingLegacyDraft = (
  resortId: string,
  sourceKind: SlopeSourceKind,
): void => {
  const legacyDraft = parseDraft(
    window.localStorage.getItem(legacyDraftKey(resortId)),
  );
  if ((legacyDraft?.sourceKind ?? "curated") === sourceKind) {
    window.localStorage.removeItem(legacyDraftKey(resortId));
  }
};

export const loadDraft = (
  resortId: string,
  sourceKind: SlopeSourceKind,
): SlopeEditDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const draft = parseDraft(
      window.localStorage.getItem(draftKey(resortId, sourceKind)),
    );
    if (draft) return draft;

    // 旧形式は resortId だけをキーにしていた。保存元が一致する場合だけ復元する。
    const legacyDraft = parseDraft(
      window.localStorage.getItem(legacyDraftKey(resortId)),
    );
    const legacySourceKind = legacyDraft?.sourceKind ?? "curated";
    return legacyDraft && legacySourceKind === sourceKind ? legacyDraft : null;
  } catch {
    return null;
  }
};

export const discardDraft = (
  resortId: string,
  sourceKind: SlopeSourceKind,
): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(resortId, sourceKind));
  removeMatchingLegacyDraft(resortId, sourceKind);
};

export const listDraftSummaries = (): DraftSummary[] => {
  if (typeof window === "undefined") return [];
  const summariesByKey = new Map<string, DraftSummary>();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(DRAFT_STORAGE_PREFIX)) continue;
    try {
      const draft = parseDraft(window.localStorage.getItem(key));
      if (!draft) continue;
      const sourceKind = draft.sourceKind ?? "curated";
      const summaryKey = `${sourceKind}:${draft.resortId}`;
      const previous = summariesByKey.get(summaryKey);
      if (previous && previous.updatedAt >= draft.updatedAt) continue;
      summariesByKey.set(summaryKey, {
        resortId: draft.resortId,
        sourceKind,
        updatedAt: draft.updatedAt,
        courseCount: draft.courses.length,
      });
    } catch {
      // 壊れた下書きは一覧へ出さない
    }
  }
  return [...summariesByKey.values()];
};

type DraftStorageState = {
  savedAt: string | null;
  isDirty: boolean;
  markExported: () => void;
  markSavedToServer: () => void;
  discard: () => void;
};

// スキー場IDごとにローカルストレージへ自動保存する
export const useDraftStorage = (
  resortId: string | null,
  sourceKind: SlopeSourceKind,
  fileHash: string | null,
  detailFileHash: string | null,
  courses: EditorCourse[],
  preservedFeatures: SlopeBeforeFeature[],
  preservedDetails: SlopeDetailEntry[],
  enabled: boolean,
): DraftStorageState => {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const skipNextSaveRef = useRef(true);

  // 編集対象の切り替え時は、直後の保存を 1 回スキップして復元直後の上書きを防ぐ
  useEffect(() => {
    skipNextSaveRef.current = true;
    if (!resortId) {
      setSavedAt(null);
      setExportedAt(null);
      return;
    }
    const draft = loadDraft(resortId, sourceKind);
    setSavedAt(draft?.updatedAt ?? null);
    setExportedAt(draft?.exportedAt ?? null);
  }, [resortId, sourceKind]);

  useEffect(() => {
    if (!enabled || !resortId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const updatedAt = new Date().toISOString();
      const draft: SlopeEditDraft = {
        version: 1,
        resortId,
        sourceKind,
        fileHash,
        detailFileHash,
        courses,
        preservedFeatures,
        preservedDetails,
        updatedAt,
        exportedAt,
      };
      try {
        window.localStorage.setItem(
          draftKey(resortId, sourceKind),
          JSON.stringify(draft),
        );
        removeMatchingLegacyDraft(resortId, sourceKind);
        setSavedAt(updatedAt);
      } catch {
        // 容量超過などで保存できない場合は最終保存時刻を更新しない
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    resortId,
    sourceKind,
    fileHash,
    detailFileHash,
    courses,
    preservedFeatures,
    preservedDetails,
    exportedAt,
  ]);

  const isDirty =
    savedAt !== null && (exportedAt === null || savedAt > exportedAt);

  // 未エクスポートの変更がある間はページ離脱時に警告する
  useEffect(() => {
    if (!enabled || !isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled, isDirty]);

  const markExported = useCallback(() => {
    if (!resortId) return;
    const exportedTime = new Date().toISOString();
    setExportedAt(exportedTime);
    const draft = loadDraft(resortId, sourceKind);
    if (draft) {
      try {
        window.localStorage.setItem(
          draftKey(resortId, sourceKind),
          JSON.stringify({ ...draft, exportedAt: exportedTime }),
        );
      } catch {
        // 保存失敗時は次回の自動保存に任せる
      }
    }
  }, [resortId, sourceKind]);

  const markSavedToServer = useCallback(() => {
    if (!resortId) return;
    discardDraft(resortId, sourceKind);
    setSavedAt(null);
    setExportedAt(null);
    skipNextSaveRef.current = true;
  }, [resortId, sourceKind]);

  const discard = useCallback(() => {
    if (!resortId) return;
    discardDraft(resortId, sourceKind);
    setSavedAt(null);
    setExportedAt(null);
    skipNextSaveRef.current = true;
  }, [resortId, sourceKind]);

  return { savedAt, isDirty, markExported, markSavedToServer, discard };
};
