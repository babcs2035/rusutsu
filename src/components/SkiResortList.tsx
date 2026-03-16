"use client";

import { Box, Checkbox, Flex, Heading, List, Text } from "@chakra-ui/react";

// コンパクトな地図表示用リゾート型
type MapResort = {
  id: string;
  nameJa: string;
  nameEn: string;
  prefecture: string;
  town: string;
  latitude: number;
  longitude: number;
  verticalDrop: number;
  numberOfCourses: number;
  beginnersCoursesPercent: number;
  status: string | null;
  yukiMagiId: string | null;
};

type Props = {
  resorts: MapResort[];
  onSelectResort: (id: string) => void;
};

/**
 * 右カラムまたはボトムシートに表示されるスキー場一覧コンポーネント
 */
export const SkiResortList = ({ resorts, onSelectResort }: Props) => {
  return (
    <Flex h="100%" flexDirection="column" bg="transparent">
      {/* ヘッダーエリア */}
      <Box
        p={4}
        pt={{ base: 2, md: 6 }}
        borderBottom="1px solid"
        borderColor="gray.100"
      >
        <Heading size="lg" color="gray.900">
          {resorts.length} 件見つかりました
        </Heading>
        <Text fontSize="sm" color="gray.500" mt={1}>
          選択すると詳細を表示します
        </Text>
      </Box>

      {/* スクロール可能なリスト本体 */}
      <List.Root
        as="ul"
        flexGrow={1}
        gap={3}
        overflowY="auto"
        px={4}
        py={4}
        listStyleType="none"
      >
        {resorts.map(resort => (
          <List.Item key={resort.id} as="li" display="block">
            <Box
              as="button"
              onClick={() => onSelectResort(resort.id)}
              w="100%"
              cursor="pointer"
              borderRadius="xl"
              bg="white"
              p={4}
              textAlign="left"
              border="1px solid"
              borderColor="gray.200"
              boxShadow="sm"
              transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
              _hover={{
                borderColor: "brand.500",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
                transform: "translateY(-2px)",
              }}
            >
              <Text
                fontWeight="800"
                fontSize="lg"
                color="gray.900"
                fontFamily="var(--font-heading)"
              >
                {resort.nameJa}
              </Text>
              <Flex justifyContent="space-between" alignItems="center" mt={1}>
                <Text fontSize="xs" color="gray.500" fontWeight="600">
                  {resort.prefecture} • {resort.town}
                </Text>
                {resort.yukiMagiId && (
                  <Box
                    px={2}
                    py={0.5}
                    bg="pink.50"
                    color="pink.500"
                    fontSize={{ base: "10px", sm: "xs" }}
                    fontWeight="bold"
                    borderRadius="full"
                    borderWidth="1px"
                    borderColor="pink.200"
                    whiteSpace="nowrap"
                  >
                    ユキマジ対象
                  </Box>
                )}
              </Flex>
              <Flex
                mt={4}
                justifyContent="space-between"
                alignItems="center"
                fontSize="sm"
                color="gray.600"
              >
                <Flex gap={{ base: 2, sm: 3 }} flexWrap="wrap">
                  <Text
                    as="span"
                    display="flex"
                    alignItems="center"
                    gap={1}
                    fontSize={{ base: "xs", sm: "sm" }}
                    whiteSpace="nowrap"
                  >
                    <Box
                      as="span"
                      h="6px"
                      w="6px"
                      borderRadius="full"
                      bg="green.500"
                    />
                    {resort.numberOfCourses} コース
                  </Text>
                  <Text
                    as="span"
                    display="flex"
                    alignItems="center"
                    gap={1}
                    fontSize={{ base: "xs", sm: "sm" }}
                    whiteSpace="nowrap"
                  >
                    <Box
                      as="span"
                      h="6px"
                      w="6px"
                      borderRadius="full"
                      bg="blue.500"
                    />
                    標高差 {resort.verticalDrop}m
                  </Text>
                </Flex>
                <Checkbox.Root
                  onClick={e => e.stopPropagation()}
                  aria-label={`${resort.nameJa}を比較対象に追加`}
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control
                    borderColor="gray.200"
                    bg="white"
                    _checked={{
                      bg: "brand.500",
                      borderColor: "brand.500",
                      color: "white",
                    }}
                  />
                </Checkbox.Root>
              </Flex>
            </Box>
          </List.Item>
        ))}
      </List.Root>
    </Flex>
  );
};
