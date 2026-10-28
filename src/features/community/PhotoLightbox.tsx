"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import type { PublicPhoto } from "./contract";

type Rect = { top: number; left: number; width: number; height: number };

const photoUrl = (id: string) =>
  `/rusutsu/api/community/photos/${encodeURIComponent(id)}`;

/**
 * 投稿写真の拡大表示。後ろが透ける薄い背景の真ん中に写真を浮かべ、×は写真の右上に置く。
 * スマホは画面全体、PCはスキー場詳細のパネルの上に重ねる（地図は隠さない）。
 */
export function PhotoLightbox({
  photos,
  index,
  anchor,
  alt,
  onIndexChange,
  onClose,
}: {
  photos: PublicPhoto[];
  index: number;
  /** 写真を押した要素。PCではこれを含む詳細パネルの上に出す */
  anchor: HTMLElement | null;
  alt: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  // 描画前に位置を決め、開いた瞬間に画面全体からパネルへ跳ねないようにする
  useLayoutEffect(() => {
    const panel = anchor?.closest<HTMLElement>(
      '[data-ski-resort-detail-panel="true"]',
    );
    const desktop = window.matchMedia("(min-width: 768px)");
    const update = () => {
      const box = desktop.matches ? panel?.getBoundingClientRect() : null;
      setRect(
        box
          ? {
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
            }
          : null,
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchor]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (event.key === "ArrowRight" && index < photos.length - 1)
        onIndexChange(index + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, onClose, onIndexChange, photos.length]);

  const photo = photos[index];
  if (!photo) return null;
  const navButton =
    "absolute top-1/2 size-8 -translate-y-1/2 rounded-full bg-white/90 p-0 text-gray-700 shadow-sm hover:bg-white hover:text-gray-900";
  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escapeキーで閉じられる
    <div
      role="dialog"
      aria-modal="true"
      aria-label="写真の拡大表示"
      className="fixed inset-0 z-[950] flex items-center justify-center bg-black/40 p-6"
      style={rect ?? undefined}
      onClick={event => {
        // ポータルでもクリックは親の投稿カードへ伝わるので、ここで止める
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* 読み込み前から縦横比で大きさを決め、一覧で読み込み済みの小さい写真を敷いておく。
          大きさが決まっていないと、読み込み後に写真が広がって流れて見える。 */}
      <div
        className="relative rounded-lg bg-cover bg-center shadow-2xl"
        style={{
          aspectRatio: `${photo.width} / ${photo.height}`,
          width: `min(100%, calc((100dvh - 6rem) * ${photo.width / photo.height}))`,
          backgroundImage: `url(${photoUrl(photo.id)}?size=thumb)`,
        }}
      >
        <Image
          key={photo.id}
          src={photoUrl(photo.id)}
          alt={alt}
          width={photo.width}
          height={photo.height}
          unoptimized
          className="block size-full rounded-lg object-contain"
        />
        <Button
          type="button"
          aria-label="拡大表示を閉じる"
          variant="ghost"
          className="absolute -top-3 -right-3 flex size-8 min-h-8 items-center justify-center rounded-full border border-gray-200 bg-white p-0 text-gray-500 shadow-md hover:bg-gray-50 hover:text-gray-900"
          onClick={onClose}
        >
          <X size={18} strokeWidth={2.5} />
        </Button>
        {photos.length > 1 && (
          <>
            {index > 0 && (
              <Button
                type="button"
                aria-label="前の写真"
                variant="ghost"
                className={`${navButton} left-2`}
                onClick={() => onIndexChange(index - 1)}
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
            {index < photos.length - 1 && (
              <Button
                type="button"
                aria-label="次の写真"
                variant="ghost"
                className={`${navButton} right-2`}
                onClick={() => onIndexChange(index + 1)}
              >
                <ChevronRight className="size-5" />
              </Button>
            )}
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white tabular-nums">
              {index + 1} / {photos.length}
            </span>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
