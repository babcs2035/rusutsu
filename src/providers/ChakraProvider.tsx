"use client";

import {
  ChakraProvider as ChakraProviderBase,
  createSystem,
  defaultConfig,
  defineConfig,
} from "@chakra-ui/react";
import type { ReactNode } from "react";

const customConfig = defineConfig({
  theme: {
    tokens: {
      fonts: {
        heading: { value: "var(--font-bricolage), sans-serif" },
        body: { value: "var(--font-manrope), sans-serif" },
      },
      colors: {
        brand: {
          50: { value: "#eff6ff" },
          100: { value: "#dbeafe" },
          200: { value: "#bfdbfe" },
          300: { value: "#93c5fd" },
          400: { value: "#60a5fa" },
          500: { value: "#3b82f6" },
          600: { value: "#2563eb" },
          700: { value: "#1d4ed8" },
          800: { value: "#1e40af" },
          900: { value: "#1e3a8a" },
        },
        surface: {
          dark: { value: "rgba(255, 255, 255, 0.95)" }, // Light card
          light: { value: "rgba(0, 0, 0, 0.05)" }, // Light hover
          glass: { value: "rgba(255, 255, 255, 0.7)" }, // Light glass
          border: { value: "rgba(0, 0, 0, 0.08)" }, // Light border
        },
      },
    },
  },
});

const system = createSystem(defaultConfig, customConfig);

export function ChakraProvider({ children }: { children: ReactNode }) {
  return <ChakraProviderBase value={system}>{children}</ChakraProviderBase>;
}
