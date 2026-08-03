"use client";

import { Box, Flex, Link, Text } from "@chakra-ui/react";
import type { PriceReference } from "../utils/priceTable";

/**
 * 料金の出典を論文の参考文献のように `[1]` で示す。
 *
 * **タップ・クリックで公式ページへ飛ぶ**。ホバーではページタイトルとURLを出して、
 * 飛ぶ前にどこへ行くのか分かるようにする（金額の根拠を確かめたい人が、
 * 押す前に「料金案内ページなのか営業時間ページなのか」を判断できる）。
 */
export const SourceMarks = ({
  numbers,
  references,
}: {
  numbers: number[];
  references: PriceReference[];
}) => {
  const byNumber = new Map(
    references.map(reference => [reference.number, reference]),
  );
  const shown = numbers
    .map(number => byNumber.get(number))
    .filter((reference): reference is PriceReference => Boolean(reference));
  if (shown.length === 0) return null;

  return (
    <Text
      as="sup"
      ml={0.5}
      fontSize="0.62rem"
      fontWeight="700"
      whiteSpace="nowrap"
    >
      {shown.map(reference => (
        <Box
          key={reference.number}
          as="span"
          position="relative"
          display="inline-block"
          css={{
            "& .source-tip": { display: "none" },
            "&:hover .source-tip, &:focus-within .source-tip": {
              display: "block",
            },
          }}
        >
          <Link
            href={reference.url}
            target="_blank"
            rel="noreferrer"
            color="brand.600"
            textDecoration="none"
            _hover={{ textDecoration: "underline" }}
            aria-label={`出典 ${reference.number}: ${reference.title ?? reference.url}`}
          >
            [{reference.number}]
          </Link>
          <Box
            className="source-tip"
            position="absolute"
            bottom="100%"
            left="50%"
            transform="translateX(-50%)"
            mb={1}
            px={2.5}
            py={2}
            borderRadius="lg"
            bg="gray.900"
            color="white"
            fontSize="0.7rem"
            fontWeight="500"
            lineHeight="1.5"
            textAlign="left"
            w="max-content"
            maxW="18rem"
            zIndex={20}
            pointerEvents="none"
            boxShadow="lg"
          >
            <Flex flexDirection="column" gap={0.5}>
              {reference.title && (
                <Text fontWeight="700" wordBreak="break-word">
                  {reference.title}
                </Text>
              )}
              <Text color="gray.300" wordBreak="break-all">
                {reference.url}
              </Text>
            </Flex>
          </Box>
        </Box>
      ))}
    </Text>
  );
};

/** 出典の一覧。表・計算結果の下に置いて [1] から辿れるようにする */
export const SourceList = ({ references }: { references: PriceReference[] }) =>
  references.length === 0 ? null : (
    <Flex flexDirection="column" gap={1}>
      <Text color="gray.700" fontSize="xs" fontWeight="800">
        出典
      </Text>
      {references.map(reference => (
        <Flex key={reference.number} gap={1.5} alignItems="baseline">
          <Text
            color="brand.600"
            fontSize="xs"
            fontWeight="700"
            whiteSpace="nowrap"
          >
            [{reference.number}]
          </Text>
          <Link
            href={reference.url}
            target="_blank"
            rel="noreferrer"
            color="gray.600"
            fontSize="xs"
            lineHeight="1.6"
            wordBreak="break-all"
          >
            {reference.title ?? reference.url}
          </Link>
        </Flex>
      ))}
    </Flex>
  );
