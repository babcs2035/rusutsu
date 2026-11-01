"use client";

import { ChevronLeft, ExternalLink } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useScreenState } from "@/features/map/session/useScreenState";
import type { SelectedMapFeature } from "@/features/map/types";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { NotFetchedBadge } from "../components/CompactInfo";
import { CurrentOverview } from "../components/CurrentOverview";
import { ObservationTimes } from "../components/ObservationTimes";
import {
  useDisplayedResortMapData,
  useSimultaneousView,
} from "../components/SimultaneousToggle";
import type { FacebookProfile } from "../server/facebookProfile";
import type { XProfile } from "../server/xProfile";
import type { Resort } from "../types";
import { hasSourceUrl } from "../utils/currentConditions";
import {
  mergeSocialAccounts,
  SOCIAL_PLATFORMS,
  type SocialAccount,
  type SocialPlatform,
} from "../utils/socialAccounts";
import { TerrainTab } from "./TerrainTab";

const PLATFORM_STYLE = {
  X: {
    icon: "x.svg",
    accountTab: "data-active:border-black data-active:bg-black",
    tab: "data-active:border-b-black dark:data-active:border-b-white",
    image: "invert dark:invert-0",
  },
  Instagram: {
    icon: "instagram.png",
    accountTab: "data-active:border-[#C13584] data-active:bg-[#C13584]",
    tab: "data-active:border-b-[#C13584]",
    image: "",
  },
  Facebook: {
    icon: "facebook.png",
    accountTab: "data-active:border-[#0866FF] data-active:bg-[#0866FF]",
    tab: "data-active:border-b-[#0866FF]",
    image: "",
  },
} as const;

type CardPlatform = Extract<SocialPlatform, "X" | "Facebook">;
type CardProfile = { name: string; detail: string | null };

const CARD_PROFILE = {
  X: {
    endpoint: (account: SocialAccount) =>
      `/rusutsu/api/social/x/${encodeURIComponent(account.handle)}`,
    toProfile: (profile: XProfile): CardProfile => ({
      name: profile.name,
      detail: null,
    }),
    fallbackName: (account: SocialAccount) => `@${account.handle}`,
  },
  Facebook: {
    endpoint: (account: SocialAccount) =>
      `/rusutsu/api/social/facebook?${new URLSearchParams({ url: account.url })}`,
    toProfile: (profile: FacebookProfile): CardProfile => ({
      name: profile.name,
      detail: profile.followers,
    }),
    fallbackName: (account: SocialAccount) => account.handle,
  },
} as const;

function SocialAccountCard({
  platform,
  account,
}: {
  platform: CardPlatform;
  account: SocialAccount;
}) {
  const [profile, setProfile] = useState<CardProfile | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(CARD_PROFILE[platform].endpoint(account), {
      signal: controller.signal,
    })
      .then(async response => (response.ok ? response.json() : null))
      .then(data => {
        if (controller.signal.aborted) return;
        setProfile(
          data?.profile ? CARD_PROFILE[platform].toProfile(data.profile) : null,
        );
      })
      .catch(() => {
        /* The registered account remains usable when lookup fails. */
      });
    return () => controller.abort();
  }, [platform, account]);
  const fallbackName = CARD_PROFILE[platform].fallbackName(account);
  const name = profile?.name ?? fallbackName;
  const note = account.label !== fallbackName ? account.label : null;
  // X は表示名の下にハンドル、Facebook はフォロワー数を出す
  const detail =
    platform === "X"
      ? name !== fallbackName
        ? fallbackName
        : null
      : (profile?.detail ?? null);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="min-w-0 flex-1">
        {note && (
          <span className="mb-1 inline-block max-w-full rounded border border-border bg-muted px-1.5 py-0.5 text-sm leading-tight break-words text-muted-foreground">
            {note}
          </span>
        )}
        <p className="break-words text-sm leading-snug font-semibold text-foreground">
          {name}
        </p>
        {detail && (
          <p className="mt-0.5 break-all text-sm text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
      <ExternalLinkComponent
        href={account.url}
        aria-label={`${name}${platform === "X" ? `（@${account.handle}）` : ""}を${platform}で見る（新しいタブ）`}
        title={`${platform}で開く`}
        className="size-9 shrink-0 justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ExternalLink aria-hidden="true" className="size-4" />
      </ExternalLinkComponent>
    </div>
  );
}

function SocialAccountCards({
  platform,
  accounts,
}: {
  platform: CardPlatform;
  accounts: SocialAccount[];
}) {
  return (
    <section
      aria-label={`${platform}のアカウント一覧`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll region must be reachable for keyboard scrolling.
      tabIndex={0}
      className="max-h-[600px] overflow-y-auto overscroll-contain bg-muted/20 p-3 focus-visible:outline-2 focus-visible:outline-ring sm:p-4"
    >
      <ul className="space-y-2">
        {accounts.map(account => (
          <li key={account.url}>
            <SocialAccountCard platform={platform} account={account} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AccountEmbed({ account }: { account: SocialAccount }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm">
        <span className="truncate font-medium">{account.label}</span>
        <ExternalLinkComponent
          href={account.url}
          className="shrink-0 text-blue-700 underline"
          icon={<ExternalLink className="size-3" />}
        >
          Instagramで開く
        </ExternalLinkComponent>
      </div>
      <div className="w-full overflow-hidden bg-white">
        <iframe
          title={`Instagram · ${account.label}`}
          src={`${account.url}embed/`}
          className="block h-[600px] w-full border-0"
          loading="eager"
          allow="encrypted-media; clipboard-write; picture-in-picture; web-share"
        />
      </div>
    </div>
  );
}

function PlatformAccounts({
  resortId,
  platform,
  accounts,
}: {
  resortId: string;
  platform: SocialPlatform;
  accounts: SocialAccount[];
}) {
  const [active, setActive] = useScreenState(
    `rusutsu:detail:v1:${resortId}:sns:${platform}`,
    z.string(),
    accounts[0]?.url ?? "",
  );
  if (!accounts.length)
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        {platform}のアカウントは登録されていません。
      </p>
    );
  // 投稿はFacebookにログイン中しか埋め込みに出ないため、Facebook もカードで並べる
  if (platform !== "Instagram")
    return <SocialAccountCards platform={platform} accounts={accounts} />;
  if (accounts.length === 1) return <AccountEmbed account={accounts[0]} />;
  return (
    <Tabs
      value={active}
      onValueChange={value => {
        if (typeof value === "string") setActive(value);
      }}
      className="min-w-0 flex-col gap-0"
    >
      <div className="border-b border-slate-200 bg-slate-50 p-3">
        <TabsList
          aria-label={`${platform}のアカウント`}
          className="grid w-full gap-2 rounded-none bg-transparent p-0"
          style={{
            gridTemplateColumns: `repeat(${accounts.length}, minmax(0, 1fr))`,
          }}
        >
          {accounts.map(account => (
            <TabsTrigger
              key={account.url}
              value={account.url}
              className={`min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-slate-600 whitespace-normal break-words hover:border-slate-400 hover:bg-slate-100 data-active:font-semibold data-active:text-white group-data-[variant=default]/tabs-list:data-active:shadow-none ${PLATFORM_STYLE[platform].accountTab}`}
            >
              <span className="min-w-0">{account.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {accounts.map(account => (
        <TabsContent key={account.url} value={account.url} keepMounted>
          <AccountEmbed account={account} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function OverviewTab({
  resort: sourceResort,
  showTerrainDetail,
  terrainTab,
  onShowTerrainDetail,
  onCloseTerrainDetail,
  selectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
}: {
  resort: Resort;
  /** コース／リフトの一覧・詳細を見せているか（false のときは概要） */
  showTerrainDetail: boolean;
  terrainTab: "コース" | "リフト";
  onShowTerrainDetail: (tab: "コース" | "リフト") => void;
  onCloseTerrainDetail: () => void;
  selectedFinalizedFeature: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
}) {
  // 「〇〇も同時に表示」中は、件数と一覧をつながったスキー場と合わせて出す
  const displayedMapData = useDisplayedResortMapData(sourceResort);
  const resort =
    displayedMapData === (sourceResort.finalizedMapData ?? null)
      ? sourceResort
      : { ...sourceResort, finalizedMapData: displayedMapData };
  if (showTerrainDetail) {
    const isCourse = terrainTab === "コース";
    const section = isCourse
      ? resort.finalizedMapData?.courses
      : resort.finalizedMapData?.lifts;
    const status = isCourse
      ? resort.finalizedMapData?.courseStatusSummary
      : null;
    const hasSource = hasSourceUrl(status?.sourceUrls ?? section?.sourceUrls);
    const observedAt = isCourse
      ? (status?.observedAt ?? section?.observedAt)
      : section?.observedAt;
    return (
      <div className="space-y-3">
        {/* 上の「ゲレンデ／SNS…」タブ（h-9 / md:h-10）の真下で固定する */}
        <div className="sticky top-9 z-10 -mx-3 -mt-3 flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5 md:top-10 md:-mx-4 md:-mt-4 md:px-4">
          <button
            type="button"
            onClick={onCloseTerrainDetail}
            className="flex min-h-7 shrink-0 items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 py-1 pr-2 pl-1 text-sm font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-100 active:bg-blue-200"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            戻る
          </button>
          {hasSource ? (
            <ObservationTimes
              entries={[{ label: terrainTab, time: observedAt }]}
            />
          ) : (
            <NotFetchedBadge
              title={`${terrainTab}の営業状況はまだ取得できていません`}
            />
          )}
        </div>
        <TerrainTab
          resort={resort}
          activeTab={terrainTab}
          selectedFinalizedFeature={selectedFinalizedFeature}
          onSelectedFinalizedFeatureChange={onSelectedFinalizedFeatureChange}
        />
      </div>
    );
  }
  return (
    <CurrentOverview
      resort={resort}
      onShowCourseDetail={() => onShowTerrainDetail("コース")}
      onShowLiftDetail={() => onShowTerrainDetail("リフト")}
    />
  );
}

export function SnsTab({ resort }: { resort: Resort }) {
  // 「〇〇も同時に表示」中は、組のスキー場のアカウントも並べる
  const { partners } = useSimultaneousView(resort);
  const accounts = useMemo(
    () =>
      partners.length
        ? mergeSocialAccounts([
            resort.socialAccounts,
            ...partners.map(partner => partner.socialAccounts),
          ])
        : resort.socialAccounts,
    [partners, resort.socialAccounts],
  );
  return (
    <section aria-label="SNS">
      <SocialTabs
        key={[resort.id, ...partners.map(partner => partner.id)].join(":")}
        resortId={resort.id}
        accounts={accounts}
      />
    </section>
  );
}

function SocialTabs({
  resortId,
  accounts,
}: {
  resortId: string;
  accounts?: Partial<Resort["socialAccounts"]> | null;
}) {
  const platforms = SOCIAL_PLATFORMS.filter(
    platform => (accounts?.[platform]?.length ?? 0) > 0,
  );
  const [active, setActive] = useScreenState(
    `rusutsu:detail:v1:${resortId}:sns`,
    z.string(),
    platforms[0] ?? "X",
  );
  if (!platforms.length) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        SNSアカウントは登録されていません。
      </p>
    );
  }
  return (
    <Tabs
      value={active}
      onValueChange={value => {
        if (typeof value === "string") setActive(value);
      }}
      className="mx-auto w-full max-w-[500px] min-w-0 flex-col gap-0 overflow-hidden rounded-xl border border-slate-200"
    >
      <TabsList
        aria-label="公式SNS"
        className="w-full gap-0 rounded-none border-b border-slate-200 bg-muted/50 p-0"
      >
        {platforms.map(platform => (
          <TabsTrigger
            key={platform}
            value={platform}
            className={`min-h-10 gap-2 rounded-none border-0 border-b-2 border-b-transparent px-2 py-2 hover:bg-muted data-active:bg-background group-data-[variant=default]/tabs-list:data-active:shadow-none ${PLATFORM_STYLE[platform].tab}`}
          >
            <Image
              src={`/rusutsu/social/${PLATFORM_STYLE[platform].icon}`}
              alt=""
              aria-hidden="true"
              width={20}
              height={20}
              unoptimized
              className={`size-5 shrink-0 object-contain ${PLATFORM_STYLE[platform].image}`}
            />
            {platform}
          </TabsTrigger>
        ))}
      </TabsList>
      {platforms.map(platform => (
        <TabsContent
          key={platform}
          value={platform}
          className="min-w-0"
          keepMounted
        >
          <PlatformAccounts
            resortId={resortId}
            key={platform}
            platform={platform}
            accounts={accounts?.[platform] ?? []}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
