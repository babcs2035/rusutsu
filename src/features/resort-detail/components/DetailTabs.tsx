"use client";

import { Button, Flex } from "@chakra-ui/react";

type Props<TTab extends string> = {
  tabs: readonly TTab[];
  activeTab: TTab;
  onTabChange: (tab: TTab) => void;
};

export const DetailTabs = <TTab extends string>({
  tabs,
  activeTab,
  onTabChange,
}: Props<TTab>) => (
  <Flex
    as="nav"
    position="sticky"
    top={0}
    zIndex={10}
    borderBottom="1px solid"
    borderColor="gray.100"
    bg="rgba(255, 255, 255, 0.95)"
    backdropFilter="blur(16px)"
    overflowX="auto"
    css={{
      "&::-webkit-scrollbar": { display: "none" },
      msOverflowStyle: "none",
      scrollbarWidth: "none",
    }}
  >
    {tabs.map(tab => (
      <Button
        key={tab}
        onClick={() => onTabChange(tab)}
        flex={{ base: "1 0 80px", md: "1 0 96px" }}
        py={4}
        px={{ base: 4, md: 2 }}
        textAlign="center"
        fontSize={{ base: "sm", md: "md" }}
        fontWeight="700"
        bg="transparent"
        borderRadius={0}
        borderBottom={activeTab === tab ? "2px solid" : "none"}
        borderColor={activeTab === tab ? "brand.500" : "transparent"}
        color={activeTab === tab ? "brand.600" : "gray.500"}
        _hover={{ bg: "gray.50", color: "brand.600" }}
        transition="all 0.2s"
      >
        {tab}
      </Button>
    ))}
  </Flex>
);
