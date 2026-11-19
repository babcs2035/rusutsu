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

/**
 * 天気タブのリンクと同じ角の立った四角いチップ。数十個並ぶので天気タブの extrabold より1段軽い bold にする
 * （日本語は600でも700でも同じ太さなので、英字の Manrope を日本語の太さに合わせる意味もある）
 */
const chipClassName =
  "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-bold leading-4 transition-colors duration-150 hover:no-underline";

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
          ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
          : "bg-slate-100 text-slate-800 hover:bg-slate-200",
      )}
    >
      {icon}
      <span className="truncate">{text}</span>
    </ExternalLinkComponent>
  );
}

/**
 * 件数の多い種類のリンク（えすぺゆきの動画、外部割引など）。種類名の小見出しの下に、区別の名前のチップを並べる。
 * 補足つきは1行を使い、補足は1行に収める（長ければ省略）
 */
function ManyLinks({ type }: { type: LinkTypeView }) {
  const [expanded, setExpanded] = useState(false);
  const links = ownLinks(type);
  const shown = expanded ? links : links.slice(0, INITIAL_LINKS_PER_TYPE);
  const hidden = links.length - shown.length;
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-600">
        <TypeIcon type={type.type} />
        {type.label}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {shown.map((link, index) => {
          const text = link.label ?? `${type.label} ${index + 1}`;
          if (!link.note)
            return <LinkChip key={linkKey(link)} link={link} text={text} />;
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
      </div>
    </div>
  );
}

/** 種類名のボタンで並べられるのは、公式などのリンクが3件まで（多いものは種類名の小見出しの下にまとめる） */
const MAX_NAMED_BUTTONS = 3;

type LinkTypeView = ResortLinkGroupView["types"][number];

/** 公式など、種類名のボタンで出すリンク（外部サイトは会社名のボタンで別に出す） */
const ownLinks = (type: LinkTypeView) =>
  type.links.filter(link => !isSiteLink(link));

/** 種類名のボタン（例: 「コース営業状況」）。押すとそのページを別タブで開く */
function TypeButtons({ type }: { type: LinkTypeView }) {
  const links = ownLinks(type);
  return links.map((link, index) => {
    // 1件なら種類名だけ。複数なら区別の名前か番号を添える（レンタル（予約）・ゲレンデマップ 2）
    const suffix =
      links.length === 1
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
        icon={<TypeIcon type={type.type} />}
      />
    );
  });
}

/** 外部サイト（ツアー会社など）のリンクは、会社名のボタン1つ。押すとそのサイトのスキー場ページを開く */
function SiteButtons({ type }: { type: LinkTypeView }) {
  return type.links
    .filter(isSiteLink)
    .map(link => (
      <LinkChip
        key={linkKey(link)}
        link={link}
        text={`${SOURCE_NAMES.get(link.source) ?? link.source}${link.label ? `（${link.label}）` : ""}`}
        title={`${type.label}: ${SOURCE_NAMES.get(link.source) ?? link.source}`}
      />
    ));
}

/**
 * 1グループ分のリンク（見出しなし）。種類名のボタンと会社名のボタンを横に並べ、
 * 公式のリンクが4件以上ある種類だけ、種類名の小見出しの下にまとめる。
 * 比較のリンク集では、グループを行・スキー場を列にした表のマスにそのまま入れる。
 */
export function LinkGroupBody({ group }: { group: ResortLinkGroupView }) {
  const many = (type: LinkTypeView) =>
    ownLinks(type).length > MAX_NAMED_BUTTONS;
  const inline = group.types.filter(type => !many(type));
  const manyTypes = group.types.filter(many);
  return (
    <div className="space-y-2">
      {(inline.length > 0 ||
        group.types.some(type => type.links.some(isSiteLink))) && (
        <div className="flex flex-wrap gap-1.5">
          {inline.map(type => (
            <TypeButtons key={type.type} type={type} />
          ))}
          {group.types.map(type => (
            <SiteButtons key={type.type} type={type} />
          ))}
        </div>
      )}
      {manyTypes.map(type => (
        <ManyLinks key={type.type} type={type} />
      ))}
    </div>
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
