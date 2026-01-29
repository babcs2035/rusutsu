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
    <Flex h="100%" flexDirection="column" bg="#f3f4f6">
      {/* ヘッダーエリア */}
      <Box p={4} pt={{ base: 2, md: 4 }}>
        <Heading size="lg" color="#1f2937">
          {resorts.length}件のスキー場
        </Heading>
      </Box>

      {/* スクロール可能なリスト本体 */}
      <List.Root
        as="ul"
        flexGrow={1}
        gap={2}
        overflowY="auto"
        px={2}
        pb={2}
        listStyleType="none"
      >
        {resorts.map(resort => (
          <List.Item key={resort.id} as="li">
            <Box
              as="button"
              onClick={() => onSelectResort(resort.id)}
              w="100%"
              cursor="pointer"
              borderRadius="md"
              bg="white"
              p={3}
              textAlign="left"
              boxShadow="sm"
              transition="box-shadow 0.2s"
              _hover={{ boxShadow: "lg" }}
            >
              <Text fontWeight="bold" color="#1f2937">
                {resort.nameJa}
              </Text>
              <Flex justifyContent="space-between" alignItems="center">
                <Text fontSize="sm" color="#4b5563">
                  {resort.prefecture}
                </Text>
                {resort.yukiMagiId && (
                  <Box
                    px={2}
                    py={0.5}
                    bg="pink.50"
                    color="pink.600"
                    fontSize="xs"
                    fontWeight="bold"
                    borderRadius="full"
                    borderWidth="1px"
                    borderColor="pink.200"
                  >
                    雪マジ
                  </Box>
                )}
              </Flex>
              <Flex
                mt={2}
                justifyContent="space-between"
                fontSize="sm"
                color="#374151"
              >
                <Text as="span">コース: {resort.numberOfCourses}</Text>
                <Text as="span">標高差: {resort.verticalDrop}m</Text>
                <Checkbox.Root
                  onClick={e => e.stopPropagation()}
                  aria-label={`${resort.nameJa}を比較対象に追加`}
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control
                    borderColor="#d1d5db"
                    _checked={{ bg: "#4f46e5", borderColor: "#4f46e5" }}
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
