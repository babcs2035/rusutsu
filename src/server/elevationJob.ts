import type {
  DataDocument,
  DataDocumentWrite,
} from "./data-documents/contract";
import type { LineGeojsonFeatureCollection } from "./derivedGeometry";

/** 保存時の版を確認し、取得中の再保存にもexpectedHashで対応する。 */
export async function updateSavedElevations(
  document: Pick<DataDocument, "key" | "hash" | "content">,
  dependencies: {
    read: (key: string) => Promise<{ hash: string } | null>;
    write: (documents: DataDocumentWrite[]) => Promise<unknown>;
    enrich: () => Promise<LineGeojsonFeatureCollection>;
  },
): Promise<void> {
  const current = await dependencies.read(document.key);
  if (current?.hash !== document.hash) return;
  const enriched = await dependencies.enrich();
  await dependencies.write([
    {
      key: document.key,
      content: `${JSON.stringify(enriched, null, 2)}\n`,
      mediaType: "application/geo+json",
      expectedHash: document.hash,
    },
  ]);
}
