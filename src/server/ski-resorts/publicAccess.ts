// 公開中の施設と，統合先の公開ページで使う資料の出どころを解決する．
import "server-only";

import { cache } from "react";
import { z } from "zod";
import {
  fetchInternalDataApi,
  usesRemoteDataApi,
} from "@/lib/internalDataApiClient";
import { findPublicResortSourcesDirect } from "./repository";

const sourcesResponse = z.object({
  resorts: z.array(
    z.object({ id: z.string(), sourceResortIds: z.array(z.string()) }),
  ),
});

/** 現在の公開状態を正本で照合する．RSC では同じ要求内の参照を共有する． */
export const readPublicResortAccess = cache(
  async (): Promise<{
    sourceIdsByResort: ReadonlyMap<string, readonly string[]>;
    linkSourceIds: ReadonlySet<string>;
    ticketSourceIds: ReadonlySet<string>;
  }> => {
    const resorts = usesRemoteDataApi()
      ? sourcesResponse.parse(
          await (
            await fetchInternalDataApi("/api/admin/resorts?view=public-sources")
          ).json(),
        ).resorts
      : await findPublicResortSourcesDirect();
    const sourceIdsByResort = new Map<string, readonly string[]>();
    const linkSourceIds = new Set<string>();
    const ticketSourceIds = new Set<string>();
    for (const { id, sourceResortIds } of resorts) {
      sourceIdsByResort.set(id, sourceResortIds);
      linkSourceIds.add(id);
      for (const sourceId of sourceResortIds) linkSourceIds.add(sourceId);
      ticketSourceIds.add(id);
      if (sourceResortIds[0]) ticketSourceIds.add(sourceResortIds[0]);
    }
    return { sourceIdsByResort, linkSourceIds, ticketSourceIds };
  },
);
