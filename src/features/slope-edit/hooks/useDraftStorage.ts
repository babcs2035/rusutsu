"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DRAFT_STORAGE_PREFIX } from "../constants";
import type { DraftSummary, EditorCourse, SlopeEditDraft } from "../types";

const draftKey = (resortId: string): string =>
  `${DRAFT_STORAGE_PREFIX}${resortId}`;

export const loadDraft = (resortId: string): SlopeEditDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(resortId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SlopeEditDraft;
    if (parsed?.version !== 1 || !Array.isArray(parsed.courses)) return null;
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
        courseCount: draft.courses.length,
      });
    }
  }
  return summaries;
};

type DraftStorageState = {
  savedAt: string | null;
  isDirty: boolean;
  markExported: () => void;
  discard: () => void;
};

// スキー場IDごとにローカルストレージへ自動保存する
export const useDraftStorage = (
  resortId: string | null,
  courses: EditorCourse[],
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
    const draft = loadDraft(resortId);
    setSavedAt(draft?.updatedAt ?? null);
    setExportedAt(draft?.exportedAt ?? null);
  }, [resortId]);

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
        courses,
        updatedAt,
        exportedAt,
      };
      try {
        window.localStorage.setItem(draftKey(resortId), JSON.stringify(draft));
        setSavedAt(updatedAt);
      } catch {
        // 容量超過などで保存できない場合は最終保存時刻を更新しない
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [enabled, resortId, courses, exportedAt]);

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
    const draft = loadDraft(resortId);
    if (draft) {
      try {
        window.localStorage.setItem(
          draftKey(resortId),
          JSON.stringify({ ...draft, exportedAt: exportedTime }),
        );
      } catch {
        // 保存失敗時は次回の自動保存に任せる
      }
    }
  }, [resortId]);

  const discard = useCallback(() => {
    if (!resortId) return;
    discardDraft(resortId);
    setSavedAt(null);
    setExportedAt(null);
    skipNextSaveRef.current = true;
  }, [resortId]);

  return { savedAt, isDirty, markExported, discard };
};
