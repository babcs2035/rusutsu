"use client";

import { useEffect, useMemo, useState } from "react";
import { getResortLinkList } from "@/actions/skiResorts";
import { Button } from "@/components/ui/button";
import type { Resort } from "@/features/resort-detail/types";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { detailLinkItems } from "./detailItems";
import linkSourcesJson from "./linkSources.json";
import {
  groupResortLinks,
  type ResortLinkGroupView,
  type ResortLinkItem,
} from "./model";

/** 1つの種類で最初に見せる件数。ツアー会社や動画は数十件になることがある */
const INITIAL_LINKS_PER_TYPE = 8;
const SOURCE_NAMES = new Map(
  linkSourcesJson.sources.map(source => [source.id, source.name]),
);

// タブを開き直すたびに読み直さないよう、読んだ結果を覚えておく
const loadedLinks = new Map<string, ResortLinkItem[]>();
const MAX_REMEMBERED_RESORTS = 30;

const chipClassName =
  "max-w-full rounded-full px-2 py-1 text-xs font-medium hover:no-underline";

/** 外部サイト（ツアー会社など）のリンクか。公式と、種類そのものがサイト名のもの（tenki.jp など）は違う */
const isSiteLink = (link: ResortLinkItem) =>
  link.source !== "official" && SOURCE_NAMES.has(link.source);

const linkKey = (link: ResortLinkItem) =>
  `${link.source}\n${link.label}\n${link.url}`;

function LinkChip({
  link,
  text,
  className,
}: {
  link: ResortLinkItem;
  text: string;
  className?: string;
}) {
  return (
    <ExternalLinkComponent
      href={link.url}
      className={cn(
        chipClassName,
        className,
        link.source === "official"
          ? "bg-blue-50 text-blue-900 hover:bg-blue-100"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200",
      )}
    >
      <span className="truncate">{text}</span>
    </ExternalLinkComponent>
  );
}

/**
 * 1つの種類のリンク。公式は区別の名前（出発地・店名など）をチップにする。
 * 外部サイトは、1件ならサイト名のチップ、複数（出発地別など）ならサイト名の後ろに並べる。
 */
function LinkChips({ links }: { links: ResortLinkItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? links : links.slice(0, INITIAL_LINKS_PER_TYPE);
  const hidden = links.length - shown.length;
  const official = shown.filter(link => !isSiteLink(link));
  const bySite = new Map<string, ResortLinkItem[]>();
  for (const link of shown) {
    if (!isSiteLink(link)) continue;
    bySite.set(link.source, [...(bySite.get(link.source) ?? []), link]);
  }
  return (
    <dd className="flex min-w-0 flex-wrap items-center gap-1">
      {official.map((link, index) => {
        // 名前の無いリンクが並ぶときは、番号で区別する（公式・公式2）
        const unnamedBefore = official
          .slice(0, index)
          .filter(other => !other.label).length;
        const text =
          link.label ??
          `${link.source === "official" ? "公式" : "開く"}${unnamedBefore > 0 ? unnamedBefore + 1 : ""}`;
        if (!link.note)
          return <LinkChip key={linkKey(link)} link={link} text={text} />;
        // 補足つきは1行を使い、補足は1行に収める（長ければ省略）
        return (
          <span
            key={linkKey(link)}
            className="flex min-w-0 basis-full items-center gap-1.5"
          >
            <LinkChip
              link={link}
              text={text}
              className="max-w-[70%] shrink-0"
            />
            <span className="min-w-0 truncate text-xs text-slate-500">
              {link.note}
            </span>
          </span>
        );
      })}
      {[...bySite].map(([source, siteLinks]) => {
        const name = SOURCE_NAMES.get(source) ?? source;
        if (siteLinks.length === 1 && !siteLinks[0].label)
          return (
            <LinkChip
              key={linkKey(siteLinks[0])}
              link={siteLinks[0]}
              text={name}
            />
          );
        return (
          <span
            key={source}
            className="flex min-w-0 basis-full flex-wrap items-center gap-1"
          >
            <span className="text-xs text-slate-600">{name}</span>
            {siteLinks.map(link => (
              <LinkChip
                key={linkKey(link)}
                link={link}
                text={link.label ?? "開く"}
              />
            ))}
          </span>
        );
      })}
      {links.length > INITIAL_LINKS_PER_TYPE && (
        <Button
          variant="ghost"
          size="xs"
          className="whitespace-nowrap text-slate-600"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? "たたむ" : `ほか${hidden}件`}
        </Button>
      )}
    </dd>
  );
}

function LinkGroups({ groups }: { groups: ResortLinkGroupView[] }) {
  return (
    <div className="space-y-4">
      {groups.map(group => (
        <section key={group.id} aria-label={group.label}>
          <h3 className="mb-1 text-sm font-semibold text-slate-900">
            {group.label}
          </h3>
          <dl className="divide-y divide-slate-100 border-y border-slate-100">
            {group.types.map(type => (
              <div
                key={type.type}
                className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 py-1.5"
              >
                <dt className="pt-1 text-xs text-slate-600">{type.label}</dt>
                <LinkChips links={type.links} />
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/**
 * スキー場のリンク一覧。どのスキー場でも同じグループ・同じ並び順で出し、リンクの無い種類は出さない。
 * 営業状況・リフト券のURLは詳細データから、公式ページ・ツアー・SNSなどはタブを開いたときに読む。
 */
export function ResortLinksTab({ resort }: { resort: Resort }) {
  const resortIds = useMemo(
    () => [...new Set([resort.id, ...(resort.sourceResortIds ?? [])])],
    [resort.id, resort.sourceResortIds],
  );
  const cacheKey = resortIds.join(",");
  const [loaded, setLoaded] = useState<{
    key: string;
    items: ResortLinkItem[] | null;
    failed: boolean;
  }>(() => ({
    key: cacheKey,
    items: loadedLinks.get(cacheKey) ?? null,
    failed: false,
  }));

  useEffect(() => {
    const remembered = loadedLinks.get(cacheKey);
    if (remembered) {
      setLoaded({ key: cacheKey, items: remembered, failed: false });
      return;
    }
    let cancelled = false;
    setLoaded({ key: cacheKey, items: null, failed: false });
    getResortLinkList(resortIds)
      .then(items => {
        if (loadedLinks.size >= MAX_REMEMBERED_RESORTS)
          loadedLinks.delete(loadedLinks.keys().next().value ?? "");
        loadedLinks.set(cacheKey, items);
        if (!cancelled) setLoaded({ key: cacheKey, items, failed: false });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: cacheKey, items: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, resortIds]);

  const items = loaded.key === cacheKey ? loaded.items : null;
  const groups = useMemo(
    () =>
      groupResortLinks([...(items ?? []), ...detailLinkItems(resort)])
        .map(group => ({
          ...group,
          types: group.types.filter(type => type.links.length > 0),
        }))
        .filter(group => group.types.length > 0),
    [items, resort],
  );

  if (items === null) return <LoadingSpinner className="h-48 bg-transparent" />;
  return (
    <section aria-label="リンク" className="min-w-0">
      <LinkGroups groups={groups} />
      {loaded.failed && (
        <p className="mt-3 text-xs text-slate-500">
          一部のリンクを読み込めませんでした。
        </p>
      )}
    </section>
  );
}
