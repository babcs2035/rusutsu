export type LatestStatusMappingKind = "courses" | "lifts";

export type ApplyGeojsonOrderResult = {
  ok: boolean;
  message: string;
};

export type LatestStatusMappingRow = {
  crawledName: string | null;
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

export type LatestStatusMappingWorkspace = {
  kind: LatestStatusMappingKind;
  latestFile: string | null;
  latestTime: string | null;
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
};
