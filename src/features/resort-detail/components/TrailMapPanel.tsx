"use client";

import { useState } from "react";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { TrailMapLinks } from "../utils/trailMapLinks";

const isPdf = (url: string) => /\.pdf($|\?)/i.test(url);

// 公式サイトの埋め込み拒否（X-Frame-Options）や拡張子なしPDFを避けるため、同一オリジン経由で出す
const proxiedUrl = (url: string) =>
  `/rusutsu/api/trail-map?url=${encodeURIComponent(url)}`;

function TrailMapItem({ url }: { url: string }) {
  // 直接の <img> が失敗したら（http の画像・外部表示の拒否など）中継の <img> で出し直し、
  // それも失敗したら拡張子のないPDFとみなして iframe で出す。
  // 画像を iframe で出すと枠に合わせて縮まず、原寸の左上だけが映るので画像は必ず <img> で出す。
  const [stage, setStage] = useState<"direct" | "proxy" | "frame">(
    // https のページから http の画像は読めない（ブラウザが https に直して失敗する）ので最初から中継
    isPdf(url) ? "frame" : url.startsWith("http:") ? "proxy" : "direct",
  );
  if (stage === "frame") {
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
      key={stage}
      src={stage === "direct" ? url : proxiedUrl(url)}
      alt="ゲレンデマップ"
      onError={() => setStage(stage === "direct" ? "proxy" : "frame")}
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
            className="underline underline-offset-2"
          >
            {isPdf(links.mapUrls[0].url)
              ? "マップPDFを開く"
              : "マップ画像を開く"}
          </ExternalLinkComponent>
        )}
        {links.mapPageUrls[0] && (
          <ExternalLinkComponent
            href={links.mapPageUrls[0].url}
            className="underline underline-offset-2"
          >
            掲載元を見る
          </ExternalLinkComponent>
        )}
      </div>
    </div>
  );
}
