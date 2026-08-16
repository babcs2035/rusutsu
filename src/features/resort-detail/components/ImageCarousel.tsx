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
 * スキー場の画像をスライドショーで表示する-carousel。
 * 4秒ごとに自動で次の画像に切り替わる。
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

  const onNext = useCallback(() => {
    setCurrentSlide(s => (s === images.length - 1 ? 0 : s + 1));
  }, [images.length]);

  useEffect(() => {
    if (!api || images.length <= 1) return;
    api.on("select", () => {
      setCurrentSlide(api.selectedScrollSnap());
    });
    const subscribeApi = api;

    const interval = setInterval(onNext, 4000);
    return () => {
      clearInterval(interval);
      subscribeApi.off("select", () => {});
    };
  }, [api, images.length, onNext]);

  if (!images || images.length === 0)
    return (
      <div className="h-[160px] w-full shrink-0 md:h-[256px] bg-gray-100" />
    );

  return (
    <Carousel
      className="w-full shrink-0 rounded-xl overflow-hidden"
      opts={{ align: "start" }}
      setApi={setApi}
    >
      <CarouselContent className="h-[160px] md:h-[256px]">
        {images.map(src => (
          <CarouselItem key={src}>
            <div className="relative h-full w-full bg-gray-100">
              <Image
                src={src}
                alt={alt}
                fill
                objectFit="contain"
                unoptimized
                priority
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      {images.length > 1 && (
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
