"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadLatestStatusMapping, saveLatestStatusMapping } from "../actions";
import type {
  LatestStatusMappingKind,
  LatestStatusMappingRow,
  LatestStatusMappingWorkspace,
  SaveLatestStatusMappingRequest,
} from "../types";
import { rowCrawledNames, withCrawledNames } from "../utils/aliases";
import { type NamedGeometry, reconcileEditedRows } from "../utils/editedRows";
import {
  applyGeometryAssignments,
  duplicateGeometryNames,
  type GeometryAssignments,
  geometryAssignmentsFromRows,
} from "../utils/geometryAssignments";
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
  geometries?: NamedGeometry[];
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
  crawledNameByGeometryId: Map<string, string | null>;
  duplicateNames: string[];
  crawledNamesByGeometryId: Map<string, string[]>;
  removeGeometryName: (id: string, name: string) => void;
  selectPattern: (id: string) => void;
  assignGeometry: (
    id: string,
    crawledName: string | null,
    aliases?: string[],
  ) => void;
  /** どの線にも割り当てられていないクロール名 */
  unmappedCrawledNames: string[];
  reload: () => void;
  assign: (geojsonName: string, crawledName: string | null) => void;
  /** 選択中のパターンから対応名を追加する */
  autoAssign: () => void;
  /** コース名を変えたときに、対応表側の名前も追従させる */
  renameGeojsonName: (from: string, to: string) => void;
  save: () => Promise<boolean>;
  getSaveRequest?: () => SaveLatestStatusMappingRequest | undefined;
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
  geometries,
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

  const [geometryAssignments, setGeometryAssignments] =
    useState<GeometryAssignments>({});
  const geometriesRef = useRef(geometries);
  geometriesRef.current = geometries;
  const duplicateNames = duplicateGeometryNames(geometries ?? []);
  const crawledNameByGeometryId = new Map(Object.entries(geometryAssignments));
  const assignGeometry = useCallback(
    (id: string, crawledName: string | null, aliases: string[] = []) => {
      setGeometryAssignments(previous => ({ ...previous, [id]: crawledName }));
      setRows(previous => {
        const geometry = geometriesRef.current?.find(
          item => item.id === id,
        ) ?? { id, name: "" };
        const existing =
          previous.find(row => row.geometryId === id) ??
          previous.find(
            row => !row.geometryId && row.geojsonName === geometry.name.trim(),
          );
        const next = withCrawledNames(
          {
            geometryId: id,
            geojsonName: geometry.name.trim() || null,
            crawledName,
          },
          crawledName
            ? [
                crawledName,
                ...aliases,
                ...(existing ? rowCrawledNames(existing) : []),
              ]
            : [],
        );
        return [...previous.filter(row => row.geometryId !== id), next];
      });
      setIsDirty(true);
      setSaveMessage(null);
    },
    [],
  );

  const effectiveRows = applyGeometryAssignments(
    rows,
    geometries ?? [],
    geometryAssignments,
    !!geometries,
  );
  const crawledNamesByGeometryId = new Map(
    effectiveRows.flatMap(row =>
      row.geometryId ? [[row.geometryId, rowCrawledNames(row)] as const] : [],
    ),
  );
  const removeGeometryName = (id: string, name: string) => {
    const remaining = (crawledNamesByGeometryId.get(id) ?? []).filter(
      value => value !== name,
    );
    setRows(previous =>
      previous.map(row =>
        row.geometryId === id ? withCrawledNames(row, remaining) : row,
      ),
    );
    setGeometryAssignments(previous => ({
      ...previous,
      [id]: remaining[0] ?? null,
    }));
    setIsDirty(true);
    setSaveMessage(null);
  };
  const selectPattern = (id: string) => {
    setWorkspace(previous => {
      const pattern = previous?.patterns?.find(item => item.id === id);
      return previous && pattern
        ? {
            ...previous,
            latestFile: pattern.fileName,
            latestTime: pattern.time,
            archiveTimestamp: pattern.archiveTimestamp ?? null,
            sourceUrls: pattern.sourceUrls,
            crawledItems: pattern.items,
          }
        : previous;
    });
  };

  const geometrySnapshot = JSON.stringify(geometries ?? []);
  const previousGeometry = useRef({ resortId, snapshot: geometrySnapshot });
  useEffect(() => {
    const previous = previousGeometry.current;
    previousGeometry.current = { resortId, snapshot: geometrySnapshot };
    if (previous.resortId !== resortId || !workspace || !geometries) return;
    const next = applyGeometryAssignments(
      reconcileEditedRows(
        rows,
        JSON.parse(previous.snapshot),
        JSON.parse(geometrySnapshot),
      ),
      geometries,
      geometryAssignments,
      true,
    );
    if (JSON.stringify(next) === JSON.stringify(rows)) return;
    setRows(next);
    setIsDirty(true);
    setSaveMessage(null);
  }, [
    geometrySnapshot,
    geometries,
    geometryAssignments,
    resortId,
    rows,
    workspace,
  ]);

  const load = useCallback(async () => {
    if (!enabled) {
      setWorkspace(null);
      setRows([]);
      setGeometryAssignments({});
      setIsDirty(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await loadLatestStatusMapping(resortId, kind, [
        ...new Set(geojsonNamesRef.current),
      ]);
      setWorkspace(data);
      setRows(data.rows);
      setGeometryAssignments(
        geometryAssignmentsFromRows(data.rows, geometriesRef.current ?? []),
      );
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

  const unmappedCrawledNames = useMemo(() => {
    const crawledNames = (workspace?.crawledItems ?? []).map(item => item.name);
    if (!geometries) return listUnmappedCrawledNames(crawledNames, rows);
    const assignments = {
      ...geometryAssignmentsFromRows(rows, geometries),
      ...geometryAssignments,
    };
    const assigned = new Set(
      applyGeometryAssignments(rows, geometries, assignments, true)
        .filter(row => geometries.some(item => item.id === row.geometryId))
        .flatMap(rowCrawledNames),
    );
    return crawledNames.filter(name => !assigned.has(name));
  }, [rows, workspace, geometries, geometryAssignments]);

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

  /** 別パターンで登録した名前を残し、選択中の候補を追加する。 */
  const autoAssign = useCallback(() => {
    if (!workspace) return;
    const suggested = createSuggestedRows(
      kind,
      workspace.crawledItems.map(item => item.name),
      [...new Set(geojsonNamesRef.current)],
    );
    const suggestions = geometryAssignmentsFromRows(
      suggested,
      geometriesRef.current ?? [],
    );
    const additions = Object.fromEntries(
      Object.entries(suggestions).filter(([, name]) => name !== null),
    );
    setRows(previous =>
      applyGeometryAssignments(
        previous,
        geometriesRef.current ?? [],
        additions,
        !!geometriesRef.current,
      ),
    );
    setGeometryAssignments(previous => ({ ...previous, ...additions }));
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
    if (!workspace || isLoading || isSaving) return false;
    if (!workspace.latestFile) return true;
    if (
      !isDirty &&
      (!geometriesRef.current || rows.some(row => row.geometryId))
    )
      return true;
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveLatestStatusMapping({
        resortId,
        kind,
        latestFile: workspace.latestFile,
        mappingFileHash: workspace.mappingFileHash,
        rows: applyGeometryAssignments(
          rows,
          geometriesRef.current ?? [],
          geometryAssignments,
          !!geometriesRef.current,
        ),
        geojsonNames: [...new Set(geojsonNamesRef.current)],
        geometries: geometriesRef.current,
      });
      if (!result.ok) {
        setError(result.errors.join("\n"));
        return false;
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
      return true;
    } catch (saveError) {
      setError(
        `保存に失敗しました: ${
          saveError instanceof Error ? saveError.message : String(saveError)
        }`,
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    isDirty,
    isLoading,
    isSaving,
    kind,
    resortId,
    rows,
    workspace,
    geometryAssignments,
  ]);

  return {
    workspace,
    rows: effectiveRows,
    isLoading,
    isSaving,
    isDirty,
    error,
    saveMessage,
    crawledNameByGeojsonName,
    crawledNameByGeometryId,
    crawledNamesByGeometryId,
    removeGeometryName,
    selectPattern,
    duplicateNames,
    assignGeometry,
    unmappedCrawledNames,
    reload: () => void load(),
    assign,
    autoAssign,
    renameGeojsonName,
    save,
    getSaveRequest: () => {
      if (isLoading || error || !workspace)
        throw new Error("対応表を読み直してから保存してください。");
      if (!workspace.latestFile) return undefined;
      return {
        resortId,
        kind,
        latestFile: workspace.latestFile,
        mappingFileHash: workspace.mappingFileHash,
        rows: applyGeometryAssignments(
          rows,
          geometriesRef.current ?? [],
          geometryAssignments,
          !!geometriesRef.current,
        ),
        geojsonNames: [...new Set(geojsonNamesRef.current)],
        geometries: geometriesRef.current,
      };
    },
  };
};
