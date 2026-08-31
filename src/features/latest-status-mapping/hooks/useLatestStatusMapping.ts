"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadLatestStatusMapping, saveLatestStatusMapping } from "../actions";
import type {
  LatestStatusMappingKind,
  LatestStatusMappingRow,
  LatestStatusMappingWorkspace,
} from "../types";
import {
  assignGeojsonName,
  createSuggestedRows,
  listUnmappedCrawledNames,
} from "../utils/rows";

type Options = {
  resortId: string;
  kind: LatestStatusMappingKind;
  /** いま編集中の線の名前。保存前の状態で突き合わせるために渡す */
  geojsonNames: string[];
  enabled?: boolean;
};

export type LatestStatusMappingState = {
  workspace: LatestStatusMappingWorkspace | null;
  rows: LatestStatusMappingRow[];
  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  error: string | null;
  saveMessage: string | null;
  /** GeoJSON 名 → 対応するクロール名 */
  crawledNameByGeojsonName: Map<string, string>;
  /** どの線にも割り当てられていないクロール名 */
  unmappedCrawledNames: string[];
  reload: () => void;
  assign: (geojsonName: string, crawledName: string | null) => void;
  /** 名前の一致から対応付けをやり直す */
  autoAssign: () => void;
  /** コース名を変えたときに、対応表側の名前も追従させる */
  renameGeojsonName: (from: string, to: string) => void;
  save: () => Promise<void>;
};

/**
 * クロール結果との対応表を読み書きする。
 *
 * 対応付け専用の画面と、コース線編集の一覧に並べる簡易版とで同じ状態を扱う。
 * 行の並びは「クローラー取得順に並べる」で使うので、割り当てのたびに
 * 作り直さず、空いている行へ入れる形で順番を保つ。
 */
export const useLatestStatusMapping = ({
  resortId,
  kind,
  geojsonNames,
  enabled = true,
}: Options): LatestStatusMappingState => {
  const [workspace, setWorkspace] =
    useState<LatestStatusMappingWorkspace | null>(null);
  const [rows, setRows] = useState<LatestStatusMappingRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const geojsonNamesRef = useRef(geojsonNames);
  geojsonNamesRef.current = geojsonNames;

  const load = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await loadLatestStatusMapping(resortId, kind, [
        ...new Set(geojsonNamesRef.current),
      ]);
      setWorkspace(data);
      setRows(data.rows);
      setIsDirty(data.needsSave);
      setSaveMessage(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "クロール結果を読み込めませんでした。",
      );
    } finally {
      setIsLoading(false);
    }
  }, [enabled, kind, resortId]);

  // 読み直すのはスキー場・種別が変わったときだけ。コース名を打ち替えている
  // 途中で再取得すると、保存前の対応付けが消えてしまう
  useEffect(() => {
    void load();
  }, [load]);

  const crawledNameByGeojsonName = useMemo(() => {
    const result = new Map<string, string>();
    for (const row of rows) {
      if (row.crawledName && row.geojsonName) {
        result.set(row.geojsonName, row.crawledName);
      }
    }
    return result;
  }, [rows]);

  const unmappedCrawledNames = useMemo(
    () =>
      listUnmappedCrawledNames(
        (workspace?.crawledItems ?? []).map(item => item.name),
        rows,
      ),
    [rows, workspace],
  );

  const assign = useCallback(
    (geojsonName: string, crawledName: string | null) => {
      setRows(previous =>
        assignGeojsonName(previous, geojsonName, crawledName),
      );
      setIsDirty(true);
      setSaveMessage(null);
    },
    [],
  );

  /** 名前の一致から対応付けをやり直す。手で直したものも作り直される */
  const autoAssign = useCallback(() => {
    if (!workspace) return;
    setRows(
      createSuggestedRows(
        kind,
        workspace.crawledItems.map(item => item.name),
        [...new Set(geojsonNamesRef.current)],
      ),
    );
    setIsDirty(true);
    setSaveMessage(null);
  }, [kind, workspace]);

  const renameGeojsonName = useCallback((from: string, to: string) => {
    const before = from.trim();
    const after = to.trim();
    if (before === "" || before === after) return;
    setRows(previous => {
      if (!previous.some(row => row.geojsonName === before)) return previous;
      return previous.map(row =>
        row.geojsonName === before
          ? { ...row, geojsonName: after === "" ? null : after }
          : row,
      );
    });
    setIsDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!workspace?.latestFile || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveLatestStatusMapping({
        resortId,
        kind,
        latestFile: workspace.latestFile,
        mappingFileHash: workspace.mappingFileHash,
        rows,
        geojsonNames: [...new Set(geojsonNamesRef.current)],
      });
      if (!result.ok) {
        setError(result.errors.join("\n"));
        return;
      }
      setWorkspace(previous =>
        previous
          ? {
              ...previous,
              mappingFileHash: result.mappingFileHash,
              savedAt: result.savedAt,
              savedSourceFile: previous.latestFile,
              needsSave: false,
            }
          : previous,
      );
      setIsDirty(false);
      setSaveMessage(`${result.writtenFile} に保存しました。`);
    } catch (saveError) {
      setError(
        `保存に失敗しました: ${
          saveError instanceof Error ? saveError.message : String(saveError)
        }`,
      );
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, kind, resortId, rows, workspace]);

  return {
    workspace,
    rows,
    isLoading,
    isSaving,
    isDirty,
    error,
    saveMessage,
    crawledNameByGeojsonName,
    unmappedCrawledNames,
    reload: () => void load(),
    assign,
    autoAssign,
    renameGeojsonName,
    save,
  };
};
