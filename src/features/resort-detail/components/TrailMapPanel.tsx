import { ExternalLink } from "lucide-react";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { TrailMapLinks } from "../utils/trailMapLinks";

const isPdf = (url: string) => /\.pdf($|\?)/i.test(url);

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
        {links.mapUrls.map(link =>
          isPdf(link.url) ? (
            // PDFもその場で見せる。開けないブラウザだけ、中のリンクが出る
            <iframe
              key={link.url}
              src={`${link.url}#toolbar=0&navpanes=0&view=Fit`}
              title="ゲレンデマップ"
              className="h-full w-full border-0 bg-white"
            />
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
