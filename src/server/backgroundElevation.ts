import { after } from "next/server";
import { enrichLiftElevations } from "@/features/lift/server/elevation";
import { enrichSlopeElevations } from "@/features/slope/server/elevation";
import { getDataDocument, writeDataDocuments } from "./data-documents/client";
import {
  type DataDocument,
  DataDocumentConflictError,
} from "./data-documents/contract";
import {
  type LineGeojsonFeatureCollection,
  synchronizeDerivedGeometry,
} from "./derivedGeometry";
import { updateSavedElevations } from "./elevationJob";

const queues = new Map<string, Promise<void>>();

/** 応答送信後に開始し、同じ公開GeoJSONへの標高取得を直列化する。 */
export function scheduleSavedElevations(
  document: Pick<DataDocument, "key" | "hash" | "content">,
  kind: "slope" | "lift",
  source: LineGeojsonFeatureCollection,
  { force = false }: { force?: boolean } = {},
) {
  after(async () => {
    const previous = queues.get(document.key) ?? Promise.resolve();
    const next = previous.then(async () => {
      try {
        await updateSavedElevations(document, {
          read: getDataDocument,
          write: writeDataDocuments,
          enrich: () =>
            kind === "slope"
              ? enrichSlopeElevations(
                  source,
                  undefined,
                  force ? null : JSON.parse(document.content),
                )
              : enrichLiftElevations(
                  force
                    ? synchronizeDerivedGeometry({
                        previousBefore: null,
                        nextBefore: source,
                        existingDerived: null,
                        intervalM: 20,
                        kind: "lift",
                      })
                    : JSON.parse(document.content),
                  { force },
                ),
        });
      } catch (error) {
        if (error instanceof DataDocumentConflictError) return;
        console.error(
          `[elevation:${document.key}] 標高更新に失敗しました`,
          error,
        );
      }
    });
    queues.set(document.key, next);
    try {
      await next;
    } finally {
      if (queues.get(document.key) === next) queues.delete(document.key);
    }
  });
}
