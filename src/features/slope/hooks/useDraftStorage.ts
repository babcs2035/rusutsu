"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResortEditorLinkDraft } from "@/shared/components/resort-editor/useResortEditorLinks";
import { hasLinkDraftChanges } from "@/shared/utils/editorDraft";
import { loadSlopeSourceData } from "../actions";
import { DRAFT_STORAGE_PREFIX } from "../constants";
import type {
  DraftSummary,
  EditorCourse,
  SlopeBeforeFeature,
  SlopeDetailEntry,
  SlopeEditDraft,
  SlopeSourceKind,
} from "../types";
import { slopeDraftContentKey } from "../utils/draftContent";
import { sourceDataToCourses } from "../utils/loadSource";

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

export const listDraftSummaries = async (): Promise<DraftSummary[]> => {
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
  const changed: DraftSummary[] = [];
  for (const summary of [...summariesByKey.values()]) {
    const draft = loadDraft(summary.resortId, summary.sourceKind);
    if (!draft) continue;
    try {
      const source = await loadSlopeSourceData(
        summary.resortId,
        summary.sourceKind,
      );
      const baseline = sourceDataToCourses(summary.resortId, source);
      if (
        slopeDraftContentKey(
          draft.courses,
          draft.preservedFeatures ?? [],
          draft.preservedDetails ?? [],
        ) ===
          slopeDraftContentKey(
            baseline.courses,
            baseline.preservedFeatures,
            baseline.preservedDetails,
          ) &&
        !hasLinkDraftChanges(draft.linkDraft)
      ) {
        // 読み込み中に別タブで更新された下書きは削除しない。
        if (
          JSON.stringify(loadDraft(summary.resortId, summary.sourceKind)) ===
          JSON.stringify(draft)
        ) {
          discardDraft(summary.resortId, summary.sourceKind);
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
  baseline: string,
  linkDraft?: ResortEditorLinkDraft,
): DraftStorageState => {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const contentKey = slopeDraftContentKey(
    courses,
    preservedFeatures,
    preservedDetails,
  );
  const hasChanges = contentKey !== baseline || hasLinkDraftChanges(linkDraft);

  // 編集対象の切り替え時に下書きの保存時刻を復元する
  useEffect(() => {
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
    if (!hasChanges) {
      discardDraft(resortId, sourceKind);
      setSavedAt(null);
      return;
    }
    const updatedAt = new Date().toISOString();
    const draft: SlopeEditDraft = {
      linkDraft,
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
  }, [
    enabled,
    hasChanges,
    resortId,
    sourceKind,
    fileHash,
    detailFileHash,
    courses,
    preservedFeatures,
    preservedDetails,
    exportedAt,
    linkDraft,
  ]);

  const isDirty = hasChanges;

  // 保存済みの内容との差分がある間はページ離脱時に警告する
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
  }, [resortId, sourceKind]);

  const discard = useCallback(() => {
    if (!resortId) return;
    discardDraft(resortId, sourceKind);
    setSavedAt(null);
    setExportedAt(null);
  }, [resortId, sourceKind]);

  return {
    savedAt: hasChanges ? savedAt : null,
    isDirty,
    markExported,
    markSavedToServer,
    discard,
  };
};
