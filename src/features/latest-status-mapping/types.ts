export type LatestStatusMappingKind = "courses" | "lifts";

export type ApplyGeojsonOrderResult = {
  ok: boolean;
  message: string;
};

export type LatestStatusMappingRow = {
  geometryId?: string;
  crawledName: string | null;
  /** 過去の取得パターンを含む、同じ線の取得名。先頭は従来形式の代表名。 */
  crawledNames?: string[];
  geojsonName: string | null;
};

export type LatestStatusMappingSection = {
  sourceFile: string;
  updatedAt: string;
  rows: LatestStatusMappingRow[];
};

export type LatestStatusMappingFile = {
  version: 1;
  courses?: LatestStatusMappingSection;
  lifts?: LatestStatusMappingSection;
};

export type LatestStatusMappingItem = {
  name: string;
  status: string | null;
  note: string | null;
  time: string | null;
};

export type LatestStatusMappingPattern = {
  id: string;
  fileName: string;
  time: string | null;
  archiveTimestamp?: string | null;
  sourceUrls: string[];
  items: LatestStatusMappingItem[];
  captureCount: number;
};

export type LatestStatusMappingWorkspace = {
  patterns?: LatestStatusMappingPattern[];
  kind: LatestStatusMappingKind;
  latestFile: string | null;
  latestTime: string | null;
  archiveTimestamp?: string | null;
  sourceUrls: string[];
  crawledItems: LatestStatusMappingItem[];
  geojsonNames: string[];
  rows: LatestStatusMappingRow[];
  savedSourceFile: string | null;
  savedAt: string | null;
  mappingFileHash: string | null;
  needsSave: boolean;
  warnings: string[];
};

export type SaveLatestStatusMappingRequest = {
  resortId: string;
  kind: LatestStatusMappingKind;
  latestFile: string;
  mappingFileHash: string | null;
  rows: LatestStatusMappingRow[];
  /** 保存前の編集画面から呼ぶ場合に使う、現在編集中のGeoJSON名 */
  geojsonNames?: string[];
  geometries?: Array<{ id: string; name: string }>;
};

export type SaveLatestStatusMappingResult =
  | {
      ok: true;
      savedAt: string;
      mappingFileHash: string;
      writtenFile: string;
    }
  | { ok: false; errors: string[] };

export type ResolvedLatestStatusMapping = {
  configured: boolean;
  sourceFile: string | null;
  byGeojsonName: Map<string, string | null>;
  namesByGeojsonName?: Map<string, string[]>;
  namesByGeometryId?: Map<string, string[]>;
  byGeometryId?: Map<string, string | null>;
};
