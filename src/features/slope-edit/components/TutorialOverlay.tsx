"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";

const TUTORIAL_STEPS = [
  "スキー場を検索するか、地図上のマーカーをクリックして選びます。",
  "既存データ・下書きがある場合は「編集」を、なければ「新規作成」を選びます。",
  "「コースを追加」を押し、地図上でコースの始点から終点へ順にクリックして点を打ちます。オレンジの終点をクリック（または Esc）で描画を終えます。",
  "コース名を入力します。名前が分からない場合は「名前なし」ボタンを選びます（エクスポート時に「無名_1」のような名前が付きます）。",
  "必要なら次の画面でコースを上部・中部・下部などに分割します（圧雪やナイターの条件が途中で変わるコースにおすすめ）。",
  "難易度・滑走距離・斜度・圧雪・早朝営業・ナイター営業を入力します。",
  "「エクスポート」からファイルとしてダウンロードします。編集内容はブラウザに自動保存されますが、ファイルに出力するまでは他の環境から見えません。",
];

type TutorialOverlayProps = {
  onClose: () => void;
};

export function TutorialOverlay({ onClose }: TutorialOverlayProps) {
  return (
    <Flex
      position="fixed"
      inset={0}
      zIndex={2000}
      bg="blackAlpha.600"
      align="center"
      justify="center"
      onClick={onClose}
    >
      <Box
        bg="white"
        borderRadius="lg"
        boxShadow="xl"
        maxW="640px"
        w="90%"
        maxH="80vh"
        overflowY="auto"
        p={6}
        onClick={event => event.stopPropagation()}
      >
        <Heading size="md" mb={4}>
          コース入力の使い方
        </Heading>
        <Flex direction="column" gap={3}>
          {TUTORIAL_STEPS.map((step, index) => (
            <Flex key={step} gap={3} align="flex-start">
              <Flex
                w="24px"
                h="24px"
                minW="24px"
                borderRadius="full"
                bg="blue.500"
                color="white"
                align="center"
                justify="center"
                fontSize="sm"
                fontWeight="bold"
              >
                {index + 1}
              </Flex>
              <Text fontSize="sm">{step}</Text>
            </Flex>
          ))}
        </Flex>
        <Flex justify="flex-end" mt={5}>
          <Button colorPalette="blue" onClick={onClose}>
            はじめる
          </Button>
        </Flex>
      </Box>
    </Flex>
  );
}
