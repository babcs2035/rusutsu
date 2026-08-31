"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

/**
 * スキー場の画像をスライドショーで表示するcarousel。
 * 4秒ごとに自動で次の画像に切り替わる。
 * 読み込みに失敗した画像は欄ごと取り除き、空欄を表示しない。
 */
export const ImageCarousel = ({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) => {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [, setCurrentSlide] = useState(0);
  const [failedSrcs, setFailedSrcs] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const visibleImages = images.filter(src => !failedSrcs.has(src));

  const handleImageError = useCallback((src: string) => {
    setFailedSrcs(prev => (prev.has(src) ? prev : new Set(prev).add(src)));
  }, []);

  const onNext = useCallback(() => {
    setCurrentSlide(s => (s === visibleImages.length - 1 ? 0 : s + 1));
  }, [visibleImages.length]);

  useEffect(() => {
    if (!api || visibleImages.length <= 1) return;
    api.on("select", () => {
      setCurrentSlide(api.selectedScrollSnap());
    });
    const subscribeApi = api;

    const interval = setInterval(onNext, 4000);
    return () => {
      clearInterval(interval);
      subscribeApi.off("select", () => {});
    };
  }, [api, visibleImages.length, onNext]);

  if (visibleImages.length === 0) return null;

  return (
    <Carousel
      className="w-full shrink-0 rounded-xl overflow-hidden"
      opts={{ align: "start" }}
      setApi={setApi}
    >
      <CarouselContent className="h-[160px] md:h-[256px]">
        {visibleImages.map(src => (
          <CarouselItem key={src}>
            <div className="relative h-full w-full bg-gray-100">
              <Image
                src={src}
                alt={alt}
                fill
                sizes="(min-width: 768px) 1000px, 100vw"
                className="object-contain"
                priority
                onError={() => handleImageError(src)}
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      {visibleImages.length > 1 && (
        <>
          <CarouselPrevious
            className="left-3 right-auto h-7 w-7 bg-black/50 text-white shadow-sm backdrop-blur-sm hover:bg-black/70"
            size="icon"
          />
          <CarouselNext
            className="right-3 left-auto h-7 w-7 bg-black/50 text-white shadow-sm backdrop-blur-sm hover:bg-black/70"
            size="icon"
          />
        </>
      )}
    </Carousel>
  );
};
