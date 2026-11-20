import "server-only";

import {
  fetchInternalDataApi,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import {
  findPassProgramStatusDirect,
  type PassProgramStatus,
  passProgramStatusSchema,
} from "./status";

/** 取得できない（データAPIが未対応など）ときは null。監視画面の本体は止めない */
export async function readPassProgramStatus(): Promise<PassProgramStatus | null> {
  try {
    if (!usesRemoteDataApi()) return await findPassProgramStatusDirect();
    const response = await fetchInternalDataApi("/api/admin/pass-programs");
    const body = (await response.json()) as { status?: unknown };
    return passProgramStatusSchema.parse(body.status);
  } catch (error) {
    console.warn("シーズン券の対象一覧の状態を取得できませんでした:", error);
    return null;
  }
}
