"use client";

import { type SetStateAction, useMemo, useRef, useState } from "react";
import {
  EMPTY_RESORT_LINKS,
  RESORT_LINK_KEYS,
} from "@/features/lift/constants";
import type { ResortLinks } from "@/features/lift/types";
import { saveResortLink } from "@/features/links/actions";
import { type LinkKey, linkSaveSchema } from "@/features/links/model";

export type ResortEditorLinkDraft = {
  links: ResortLinks;
  baseline: ResortLinks;
};

export function useResortEditorLinks() {
  const [links, setState] = useState<ResortLinks>(EMPTY_RESORT_LINKS);
  const [savedLinks, setSavedLinks] = useState(EMPTY_RESORT_LINKS);
  const current = useRef(links);
  const baseline = useRef<ResortLinks>(EMPTY_RESORT_LINKS);
  const resortId = useRef("");
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const setLinks = (next: SetStateAction<ResortLinks>) => {
    current.current = typeof next === "function" ? next(current.current) : next;
    setState(current.current);
  };
  const initialize = (
    id: string,
    saved: ResortLinks,
    draft?: ResortEditorLinkDraft,
  ) => {
    resortId.current = id;
    const next = { ...saved };
    const expected = { ...saved };
    for (const key of RESORT_LINK_KEYS) {
      if (
        draft &&
        JSON.stringify(draft.links[key]) !== JSON.stringify(draft.baseline[key])
      ) {
        next[key] = draft.links[key];
        expected[key] = draft.baseline[key];
      }
    }
    baseline.current = expected;
    setSavedLinks(expected);
    setLinks(next);
  };
  const save = async (
    keys: readonly LinkKey[] = RESORT_LINK_KEYS,
  ): Promise<string[]> => {
    if (saving.current)
      throw new Error("リンクの保存中です。完了後に再度保存してください。");
    if (!resortId.current)
      throw new Error("スキー場のリンクを読み込んでください。");
    // 全項目を検証してから書き込み、未編集のリンクは上書きしない。
    const requests = keys.flatMap(platform => {
      const links = current.current[platform]
        .filter(link => link.url.trim())
        .map(link => ({
          ...link,
          url: link.url.trim(),
        }));
      const expectedLinks = baseline.current[platform];
      if (JSON.stringify(links) === JSON.stringify(expectedLinks)) return [];
      const parsed = linkSaveSchema.safeParse({
        resortId: resortId.current,
        platform,
        links,
        expectedLinks,
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues.map(issue => issue.message).join("\n"),
        );
      return [parsed.data];
    });
    saving.current = true;
    setIsSaving(true);
    try {
      for (const request of requests) {
        const result = await saveResortLink(request);
        if (!result.ok) throw new Error(result.message);
        baseline.current = {
          ...baseline.current,
          [request.platform]: result.links,
        };
        setSavedLinks(baseline.current);
      }
      return requests.length ? ["SkiResortLinks.json"] : [];
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };
  const draft = useMemo(
    () => ({ links, baseline: savedLinks }),
    [links, savedLinks],
  );
  return { links, setLinks, initialize, save, isSaving, draft };
}

export type ResortEditorLinks = ReturnType<typeof useResortEditorLinks>;
