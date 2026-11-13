"use client";

import Image from "next/image";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Resort } from "@/features/resort-detail/types";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import linkSourcesJson from "./linkSources.json";
import type { ResortLinkGroupView, ResortLinkItem } from "./model";
import { useResortLinkGroups } from "./useResortLinkGroups";

/** 1つの種類で最初に見せる件数。ツアー会社や動画は数十件になることがある */
const INITIAL_LINKS_PER_TYPE = 8;
const SOURCE_NAMES = new Map(
  linkSourcesJson.sources.map(source => [source.id, source.name]),
);

const chipClassName =
  "max-w-full whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium hover:no-underline";

/** 外部サイト（ツアー会社など）のリンクか。公式と、種類そのものがサイト名のもの（tenki.jp など）は違う */
const isSiteLink = (link: ResortLinkItem) =>
  link.source !== "official" && SOURCE_NAMES.has(link.source);

/** SNSの種類に添えるロゴ（public/social）。X は白の原画を明るい背景で黒く見せる */
const SOCIAL_ICONS: Record<string, { src: string; className?: string }> = {
  x: { src: "x.svg", className: "invert" },
  instagram: { src: "instagram.png" },
  facebook: { src: "facebook.png" },
};

function TypeIcon({ type }: { type: string }) {
  const icon = SOCIAL_ICONS[type];
  if (!icon) return null;
  return (
    <Image
      src={`/rusutsu/social/${icon.src}`}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      unoptimized
      className={cn("size-4 shrink-0 object-contain", icon.className)}
    />
  );
}

const linkKey = (link: ResortLinkItem) =>
  `${link.source}\n${link.label}\n${link.url}`;

function LinkChip({
  link,
  text,
  title,
  className,
  icon,
}: {
  link: ResortLinkItem;
  text: string;
  title?: string;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <ExternalLinkComponent
      href={link.url}
      title={title}
      className={cn(
        chipClassName,
        className,
        link.source === "official"
          ? "bg-blue-50 text-blue-900 hover:bg-blue-100"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200",
      )}
    >
      {icon}
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

/** 種類名のボタンで並べられるのは、公式などのリンクが3件まで（ツアー会社のように多いものは行にまとめる） */
const MAX_NAMED_BUTTONS = 3;

type LinkTypeView = ResortLinkGroupView["types"][number];

const canUseTypeButtons = (type: LinkTypeView) =>
  type.links.length === 1 ||
  (type.links.length <= MAX_NAMED_BUTTONS &&
    type.links.every(link => !isSiteLink(link)));

/** 種類名のボタン（例: 「コース営業状況」）。押すとそのページを別タブで開く */
function TypeButtons({ type }: { type: LinkTypeView }) {
  return type.links.map((link, index) => {
    // 1件なら種類名だけ。複数なら区別の名前か番号を添える（レンタル料金（予約）・ゲレンデマップ 2）
    const suffix =
      type.links.length === 1
        ? ""
        : link.label
          ? `（${link.label}）`
          : index > 0
            ? ` ${index + 1}`
            : "";
    const detail = [link.label, link.note].filter(Boolean).join(" / ");
    return (
      <LinkChip
        key={linkKey(link)}
        link={link}
        text={`${type.label}${suffix}`}
        title={detail || undefined}
        className="px-2.5 py-1.5"
        icon={<TypeIcon type={type.type} />}
      />
    );
  });
}

/**
 * 1グループ分のリンク（見出しなし）。種類名のボタンを先に並べ、件数の多い種類は行にまとめる。
 * 比較のリンク集では、グループを行・スキー場を列にした表のマスにそのまま入れる。
 */
export function LinkGroupBody({ group }: { group: ResortLinkGroupView }) {
  const buttonTypes = group.types.filter(canUseTypeButtons);
  const rowTypes = group.types.filter(type => !canUseTypeButtons(type));
  return (
    <>
      {buttonTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {buttonTypes.map(type => (
            <TypeButtons key={type.type} type={type} />
          ))}
        </div>
      )}
      {rowTypes.length > 0 && (
        <dl
          className={cn(
            "divide-y divide-slate-100 border-y border-slate-100",
            buttonTypes.length > 0 && "mt-1.5",
          )}
        >
          {rowTypes.map(type => (
            <div
              key={type.type}
              className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 py-1.5"
            >
              <dt className="flex items-start gap-1 pt-1 text-xs text-slate-600">
                <TypeIcon type={type.type} />
                {type.label}
              </dt>
              <LinkChips links={type.links} />
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

/** グループ名の小見出しつきで、全グループを縦に並べる */
export function LinkGroups({ groups }: { groups: ResortLinkGroupView[] }) {
  return (
    <div className="space-y-3">
      {groups.map(group => (
        <section key={group.id} aria-label={group.label}>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-900">
            {group.label}
          </h3>
          <LinkGroupBody group={group} />
        </section>
      ))}
    </div>
  );
}

/**
 * スキー場のリンク一覧。どのスキー場でも同じグループ・同じ並び順で出し、リンクの無い種類は出さない。
 * 営業状況・リフト券のURLは詳細データから、公式ページ・ツアー・SNS（X・Instagram・Facebook はロゴつき）などはタブを開いたときに読む。
 */
export function ResortLinksTab({ resort }: { resort: Resort }) {
  const resorts = useMemo(() => [resort], [resort]);
  const [entry] = useResortLinkGroups(resorts);

  if (!entry || entry.isLoading)
    return <LoadingSpinner className="h-48 bg-transparent" />;
  return (
    <section aria-label="リンク集" className="min-w-0">
      <LinkGroups groups={entry.groups} />
      {entry.failed && <LinkLoadFailedNote />}
    </section>
  );
}

/** リンクのテーブルを読めなかったときの一言。詳細データが持つリンクは出ている */
export function LinkLoadFailedNote() {
  return (
    <p className="mt-3 text-xs text-slate-500">
      一部のリンクを読み込めませんでした。
    </p>
  );
}
