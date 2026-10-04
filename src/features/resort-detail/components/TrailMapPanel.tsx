"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { TrailMapLinks } from "../utils/trailMapLinks";

const isPdf = (url: string) => /\.pdf($|\?)/i.test(url);

// 公式サイトの埋め込み拒否（X-Frame-Options）や拡張子なしPDFを避けるため、同一オリジン経由で出す
const proxiedUrl = (url: string) =>
  `/rusutsu/api/trail-map?url=${encodeURIComponent(url)}`;

function TrailMapItem({ url }: { url: string }) {
  // 拡張子のないURLがPDFだと <img> が失敗するので、その場合はPDFとして出し直す
  const [imageFailed, setImageFailed] = useState(false);
  if (isPdf(url) || imageFailed) {
    return (
      <iframe
        src={`${proxiedUrl(url)}#toolbar=0&navpanes=0&view=Fit`}
        title="ゲレンデマップ"
        className="h-full w-full border-0 bg-white"
      />
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: 外部サイトが公開する画像をそのまま表示するため next/image の最適化は使わない
    <img
      src={url}
      alt="ゲレンデマップ"
      onError={() => setImageFailed(true)}
      className="mx-auto max-h-full w-auto max-w-full object-contain"
    />
  );
}

/**
 * 公式のゲレンデマップ画像（またはPDF）と、その出典をそのまま見せるパネル。
 * スマホは地図の「ゲレンデマップ」タブの中身、PCは「ゲレンデ」タブの先頭に置く。
 */
export function TrailMapPanel({
  links,
  className,
}: {
  links: TrailMapLinks;
  className?: string;
}) {
  return (
    <div className={`flex h-full flex-col overflow-y-auto ${className ?? ""}`}>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100">
        {links.mapUrls.map(link => (
          <TrailMapItem key={link.url} url={link.url} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-200 bg-white px-3 py-2 text-sm">
        {links.mapUrls[0] && (
          <ExternalLinkComponent
            href={links.mapUrls[0].url}
            className="text-blue-700 underline underline-offset-2"
            icon={<ExternalLink className="size-3.5" />}
          >
            {isPdf(links.mapUrls[0].url)
              ? "マップPDFを開く"
              : "マップ画像を開く"}
          </ExternalLinkComponent>
        )}
        {links.mapPageUrls[0] && (
          <ExternalLinkComponent
            href={links.mapPageUrls[0].url}
            className="text-blue-700 underline underline-offset-2"
            icon={<ExternalLink className="size-3.5" />}
          >
            掲載元を見る
          </ExternalLinkComponent>
        )}
      </div>
    </div>
  );
}
