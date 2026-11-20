/** 編集申請と画面の更新が，同じ入力検証と保存処理を使う． */
import "server-only";

import path from "node:path";
import {
  readMappingCrawlLatestStatus,
  readMappingStatusHistory,
} from "@/lib/crawlLatestCurrent";
import { runEdit } from "@/server/edit-requests/workflow";
import type {
  SaveLatestStatusMappingRequest,
  SaveLatestStatusMappingResult,
} from "../types";
import { saveLatestStatusMappingFile } from "./mappingFiles";

const TEMPORARY_ROOT = path.join(
  process.cwd(),
  "src",
  "private",
  "data",
  "resorts-temporary",
);

const loadCanonicalLatestStatus = readMappingCrawlLatestStatus;

export const saveLatestStatusMapping = async (
  request: SaveLatestStatusMappingRequest,
): Promise<SaveLatestStatusMappingResult> => {
  return runEdit("mapping", request.resortId, request, async () => {
    return saveLatestStatusMappingFile(
      TEMPORARY_ROOT,
      request,
      loadCanonicalLatestStatus,
      readMappingStatusHistory,
    );
  });
};
