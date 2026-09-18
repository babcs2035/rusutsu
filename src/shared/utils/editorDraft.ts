import type { ResortEditorLinkDraft } from "@/shared/components/resort-editor/useResortEditorLinks";

/** オブジェクトのキー順は無視し、コース・リフトの並び順は比較する。 */
export const draftContentKey = (value: unknown): string =>
  JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : entry,
  );

export const hasLinkDraftChanges = (draft?: ResortEditorLinkDraft): boolean =>
  !!draft && draftContentKey(draft.links) !== draftContentKey(draft.baseline);
