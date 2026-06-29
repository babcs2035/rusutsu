"use client";

import { Box, Button, Flex } from "@chakra-ui/react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

export const ImageCarousel = ({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback(
    () => setCurrentSlide(s => (s === images.length - 1 ? 0 : s + 1)),
    [images.length],
  );
  const prevSlide = useCallback(
    () => setCurrentSlide(s => (s === 0 ? images.length - 1 : s - 1)),
    [images.length],
  );

  useEffect(() => {
    if (!images || images.length <= 1) return;
    const interval = setInterval(nextSlide, 4000);
    return () => clearInterval(interval);
  }, [images, nextSlide]);

  if (!images || images.length === 0)
    return (
      <Box
        h={{ base: "160px", md: "256px" }}
        w="100%"
        flexShrink={0}
        bg="#d1d5db"
      />
    );

  return (
    <Box
      position="relative"
      h={{ base: "160px", md: "256px" }}
      w="100%"
      flexShrink={0}
      overflow="hidden"
    >
      <Flex
        h="100%"
        w="100%"
        transition="transform 0.7s ease-in-out"
        style={{ transform: `translateX(-${currentSlide * 100}%)` }}
      >
        {images.map((src: string) => (
          <Box key={src} position="relative" h="100%" w="100%" flexShrink={0}>
            <Image
              src={src}
              alt={alt}
              fill
              style={{ objectFit: "contain" }}
              unoptimized
              priority
            />
          </Box>
        ))}
      </Flex>
      {images.length > 1 && (
        <>
          <Button
            onClick={prevSlide}
            position="absolute"
            left={3}
            top="50%"
            transform="translateY(-50%)"
            display="flex"
            h={7}
            w={7}
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            bg="blackAlpha.500"
            fontSize="2xl"
            color="white"
            boxShadow="lg"
            backdropFilter="blur(4px)"
            _hover={{
              bg: "blackAlpha.700",
              transform: "translateY(-50%) scale(1.1)",
            }}
            _focus={{
              outline: "none",
              ring: "2px",
              ringColor: "whiteAlpha.500",
            }}
            minW="auto"
            p={0}
            aria-label="前の画像"
          >
            ‹
          </Button>
          <Button
            onClick={nextSlide}
            position="absolute"
            right={3}
            top="50%"
            transform="translateY(-50%)"
            display="flex"
            h={7}
            w={7}
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            bg="blackAlpha.500"
            fontSize="2xl"
            color="white"
            boxShadow="lg"
            backdropFilter="blur(4px)"
            _hover={{
              bg: "blackAlpha.700",
              transform: "translateY(-50%) scale(1.1)",
            }}
            _focus={{
              outline: "none",
              ring: "2px",
              ringColor: "whiteAlpha.500",
            }}
            minW="auto"
            p={0}
            aria-label="次の画像"
          >
            ›
          </Button>
        </>
      )}
    </Box>
  );
};
