"use client";

import { ExternalLink } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { XProfile } from "../server/xProfile";
import type { Resort } from "../types";
import {
  SOCIAL_PLATFORMS,
  type SocialAccount,
  type SocialPlatform,
} from "../utils/socialAccounts";

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

function XAccountCard({ account }: { account: SocialAccount }) {
  const [profile, setProfile] = useState<XProfile | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/rusutsu/api/social/x/${encodeURIComponent(account.handle)}`, {
      signal: controller.signal,
    })
      .then(async response => (response.ok ? response.json() : null))
      .then(data => {
        if (!controller.signal.aborted) setProfile(data?.profile ?? null);
      })
      .catch(() => {
        /* The registered account remains usable when lookup fails. */
      });
    return () => controller.abort();
  }, [account.handle]);
  const name = profile?.name ?? `@${account.handle}`;
  const note = account.label !== `@${account.handle}` ? account.label : null;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="min-w-0 flex-1">
        {note && (
          <span className="mb-1 inline-block max-w-full rounded border border-border bg-muted px-1.5 py-0.5 text-xs leading-tight break-words text-muted-foreground">
            {note}
          </span>
        )}
        <p className="break-words text-sm leading-snug font-semibold text-foreground">
          {name}
        </p>
        {name !== `@${account.handle}` && (
          <p className="mt-0.5 break-all text-xs text-muted-foreground">
            @{account.handle}
          </p>
        )}
      </div>
      <ExternalLinkComponent
        href={account.url}
        aria-label={`${name}（@${account.handle}）をXで見る（新しいタブ）`}
        title="Xで開く"
        className="size-9 shrink-0 justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ExternalLink aria-hidden="true" className="size-4" />
      </ExternalLinkComponent>
    </div>
  );
}

function XAccountCards({ accounts }: { accounts: SocialAccount[] }) {
  return (
    <section
      aria-label="Xのアカウント一覧"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll region must be reachable for keyboard scrolling.
      tabIndex={0}
      className="max-h-[600px] overflow-y-auto overscroll-contain bg-muted/20 p-3 focus-visible:outline-2 focus-visible:outline-ring sm:p-4"
    >
      <ul className="space-y-2">
        {accounts.map(account => (
          <li key={account.url}>
            <XAccountCard account={account} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AccountEmbed({
  platform,
  account,
  width,
}: {
  platform: Exclude<SocialPlatform, "X">;
  account: SocialAccount;
  width: number;
}) {
  const params = new URLSearchParams({
    href: account.url,
    tabs: "timeline",
    width: String(width),
    height: "670",
    small_header: "true",
    adapt_container_width: "false",
    hide_cover: "true",
    show_facepile: "false",
  });
  return (
    <div className="min-w-0 space-y-3">
      <div
        className={
          platform === "Facebook"
            ? "h-[600px] w-full overflow-hidden bg-white"
            : "w-full overflow-hidden bg-white"
        }
      >
        {platform !== "Facebook" || width > 0 ? (
          <iframe
            title={`${platform} · ${account.label}`}
            src={
              platform === "Instagram"
                ? `${account.url}embed/`
                : `https://www.facebook.com/plugins/page.php?${params}`
            }
            // The compact Facebook page header is 70px tall and currently
            // renders with overlapping text. Keep the timeline visible below it.
            className={
              platform === "Facebook"
                ? "block h-[670px] w-full -translate-y-[70px] border-0"
                : "block h-[600px] w-full border-0"
            }
            loading="eager"
            allow="encrypted-media; clipboard-write; picture-in-picture; web-share"
          />
        ) : null}
      </div>
      <div className="space-y-1 px-3 pb-3 text-center">
        <ExternalLinkComponent
          href={account.url}
          className="text-sm text-blue-600 hover:underline"
        >
          {account.label} を{platform}で見る ↗
        </ExternalLinkComponent>
        <p className="text-xs text-muted-foreground">
          表示されない場合は、公式アカウントをご覧ください。
        </p>
      </div>
    </div>
  );
}

function PlatformAccounts({
  platform,
  accounts,
  width,
}: {
  platform: SocialPlatform;
  accounts: SocialAccount[];
  width: number;
}) {
  if (!accounts.length)
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        {platform}のアカウントは登録されていません。
      </p>
    );
  if (platform === "X") return <XAccountCards accounts={accounts} />;
  if (accounts.length === 1)
    return (
      <AccountEmbed platform={platform} account={accounts[0]} width={width} />
    );
  return (
    <Tabs defaultValue={accounts[0].url} className="min-w-0 flex-col gap-0">
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
          <AccountEmbed platform={platform} account={account} width={width} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function OverviewTab({ resort }: { resort: Resort }) {
  return <SocialTabs key={resort.id} accounts={resort.socialAccounts} />;
}

function SocialTabs({ accounts }: { accounts: Resort["socialAccounts"] }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!container.current) return;
    // Measure the visible shell, never a hidden panel. All accounts can then
    // create correctly sized widgets before their tabs are selected.
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        setWidth(
          Math.max(180, Math.min(500, Math.floor(entry.contentRect.width))),
        );
      }
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const platforms = SOCIAL_PLATFORMS.filter(
    platform => accounts[platform].length > 0,
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
      ref={container}
      defaultValue={platforms[0]}
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
            className={`min-h-12 gap-2.5 rounded-none border-0 border-b-2 border-b-transparent px-2 py-3 hover:bg-muted data-active:bg-background group-data-[variant=default]/tabs-list:data-active:shadow-none ${PLATFORM_STYLE[platform].tab}`}
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
            key={platform}
            platform={platform}
            accounts={accounts[platform]}
            width={width}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
