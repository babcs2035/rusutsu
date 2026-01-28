"use client";

import { Box, Checkbox, Flex, Heading, List, Text } from "@chakra-ui/react";
import type { SkiResortT } from "@/types";

// 親コンポーネントから受け取る props の型をシンプルに戻す
type Props = {
  resorts: SkiResortT[];
  onSelectResort: (id: string) => void;
};

/**
 * 右カラムまたはボトムシートに表示されるスキー場一覧コンポーネント
 */
export const SkiResortList = ({ resorts, onSelectResort }: Props) => {
  return (
    // 親要素(vaulのコンテナ)の高さいっぱいに広がるコンテナ
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
                {resort.name.ja}
              </Text>
              <Text fontSize="sm" color="#4b5563">
                {resort.location.prefecture}
              </Text>
              <Flex
                mt={2}
                justifyContent="space-between"
                fontSize="sm"
                color="#374151"
              >
                <Text as="span">⭐️ {resort.outline?.review || "評価なし"}</Text>
                <Text as="span">コース: {resort.courses.numberOfCourses}</Text>
                <Text as="span">標高差: {resort.courses.vertical}m</Text>
                <Checkbox.Root
                  onClick={e => e.stopPropagation()}
                  aria-label={`${resort.name.ja}を比較対象に追加`}
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
