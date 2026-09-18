import { ExternalLink, Map as MapIcon } from "lucide-react";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { TrailMapLinks } from "../utils/trailMapLinks";

const isPdf = (url: string) => /\.pdf($|\?)/i.test(url);

/**
 * 公式のゲレンデマップ画像（またはPDF）と、その出典をそのまま見せるパネル。
 * 地図タブに並ぶ「ゲレンデマップ」タブの中身。
 */
export function TrailMapPanel({
  links,
  onShowMap,
  className,
}: {
  links: TrailMapLinks;
  /** 押すとインタラクティブな地図タブへ戻す */
  onShowMap: () => void;
  className?: string;
}) {
  return (
    <div className={`flex h-full flex-col overflow-y-auto ${className ?? ""}`}>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100">
        {links.mapUrls.map(link =>
          isPdf(link.url) ? (
            <div
              key={link.url}
              className="flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-600"
            >
              <p>このゲレンデマップはPDF形式です。</p>
              <ExternalLinkComponent
                href={link.url}
                className="font-medium text-blue-700 underline underline-offset-2"
                icon={<ExternalLink className="size-3.5" />}
              >
                PDFを開く
              </ExternalLinkComponent>
            </div>
          ) : (
            // biome-ignore lint/performance/noImgElement: 外部サイトが公開する画像をそのまま表示するため next/image の最適化は使わない
            <img
              key={link.url}
              src={link.url}
              alt="ゲレンデマップ"
              className="mx-auto max-h-full w-auto max-w-full object-contain"
            />
          ),
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-200 bg-white px-3 py-2 text-sm">
        {links.mapUrls[0] && (
          <ExternalLinkComponent
            href={links.mapUrls[0].url}
            className="text-blue-700 underline underline-offset-2"
            icon={<ExternalLink className="size-3.5" />}
          >
            マップ画像を開く{" "}
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
