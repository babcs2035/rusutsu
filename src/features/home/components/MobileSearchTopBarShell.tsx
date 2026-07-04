"use client";

import { Box } from "@chakra-ui/react";
import type { FormEvent, ReactNode } from "react";

export const MOBILE_SEARCH_TOP_BAR_HEIGHT =
  "calc(env(safe-area-inset-top, 0px) + 4rem)";

type Props = {
  action: ReactNode;
  children: ReactNode;
  background?: string;
  onSubmit?: (event: FormEvent<HTMLElement>) => void;
};

export const MobileSearchTopBarShell = ({
  action,
  background = "white",
  children,
  onSubmit,
}: Props) => (
  <Box
    as={onSubmit ? "form" : "div"}
    display={{ base: "block", md: "none" }}
    h={MOBILE_SEARCH_TOP_BAR_HEIGHT}
    px={4}
    pt="calc(env(safe-area-inset-top, 0px) + 0.625rem)"
    pb={2}
    bg={background}
    onSubmit={onSubmit}
  >
    <Box
      display="grid"
      gridTemplateColumns="minmax(0, 2fr) minmax(0, 1fr)"
      columnGap={2.5}
      alignItems="center"
      w="100%"
      boxSizing="border-box"
    >
      <Box minW={0}>{children}</Box>
      {action}
    </Box>
  </Box>
);
