"use client";

import {
  ChakraProvider as ChakraProviderBase,
  defaultSystem,
} from "@chakra-ui/react";
import type { ReactNode } from "react";

export function ChakraProvider({ children }: { children: ReactNode }) {
  return (
    <ChakraProviderBase value={defaultSystem}>{children}</ChakraProviderBase>
  );
}
