import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SHARE_MAP_SIZES, type ShareMapSize } from "@/features/share/mapCard";
import { ShareMapRender } from "@/features/share/ShareMapRender";
import { getShareResort } from "@/server/share/data";
import { isResortIdSegment } from "@/shared/utils/resortPath";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ShareMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ resortId: string }>;
  searchParams: Promise<{ size?: string }>;
}) {
  const { resortId } = await params;
  const { size = "detail" } = await searchParams;
  if (!isResortIdSegment(resortId) || !Object.hasOwn(SHARE_MAP_SIZES, size))
    notFound();
  const data = await getShareResort(resortId);
  if (!data) notFound();
  return (
    <main>
      <ShareMapRender {...data} size={size as ShareMapSize} />
      <p>
        背景：
        <a
          href="https://maps.gsi.go.jp/development/ichiran.html#seamlessphoto"
          target="_blank"
          rel="noopener noreferrer"
        >
          国土地理院
        </a>
        を加工し、Rusutsuがコース・リフト・斜度表示を追記。
      </p>
      <p>
        標高：
        <a
          href="https://maps.gsi.go.jp/development/elevation_s.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          国土地理院
        </a>
        。斜度はRusutsuの計算値。
      </p>
      <p>
        OSM由来のコースデータ：
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          © OpenStreetMap contributors / ODbL
        </a>
      </p>
    </main>
  );
}
