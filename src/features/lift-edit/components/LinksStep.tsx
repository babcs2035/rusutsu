"use client";

import { Box, Button, Flex, Heading, Input, Text } from "@chakra-ui/react";
import { RESORT_LINK_KEYS, RESORT_LINK_LABELS } from "../constants";
import type { ResortLink, ResortLinks, ResortOption } from "../types";

type LinksStepProps = {
  resort: ResortOption;
  links: ResortLinks;
  setLinks: (links: ResortLinks) => void;
  onProceed: () => void;
  onBack: () => void;
};

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="xs" fontWeight="bold" color="gray.600" mb="2px">
    {children}
  </Text>
);

type LinkListFieldProps = {
  label: string;
  values: ResortLink[];
  onChange: (values: ResortLink[]) => void;
};

export const LinkListField = ({
  label,
  values = [],
  onChange,
}: LinkListFieldProps) => {
  const handleChangeAt = (index: number, value: Partial<ResortLink>) => {
    onChange(
      values.map((current, i) =>
        i === index ? { ...current, ...value } : current,
      ),
    );
  };
  const handleRemoveAt = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };
  const handleAdd = () => onChange([...values, { url: "" }]);

  return (
    <Box>
      <FieldLabel>{label}</FieldLabel>
      <Flex direction="column" gap={2}>
        {values.map((value, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 並び替えがなく末尾追加・任意削除のみのため
          <Flex key={index} gap={2} align="flex-start">
            <Flex direction={{ base: "column", md: "row" }} gap={2} flex={1}>
              <Input
                size="sm"
                placeholder="https://..."
                value={value.url}
                onChange={event =>
                  handleChangeAt(index, { url: event.target.value })
                }
              />
              <Input
                size="sm"
                placeholder="補足"
                value={value.description ?? ""}
                onChange={event =>
                  handleChangeAt(index, {
                    description: event.target.value || undefined,
                  })
                }
              />
            </Flex>
            <Button
              size="sm"
              variant="outline"
              colorPalette="red"
              onClick={() => handleRemoveAt(index)}
            >
              削除
            </Button>
          </Flex>
        ))}
        <Button
          size="xs"
          variant="outline"
          alignSelf="flex-start"
          onClick={handleAdd}
        >
          + {label}を追加
        </Button>
      </Flex>
    </Box>
  );
};

export function LinksStep({
  resort,
  links,
  setLinks,
  onProceed,
  onBack,
}: LinksStepProps) {
  return (
    <Flex h="100%" minH={0} justify="center" overflowY="auto" bg="gray.50">
      <Flex direction="column" w="820px" maxW="100%" p={6} gap={4}>
        <Flex justify="space-between" align="center">
          <Box>
            <Heading size="md">スキー場全体のリンク</Heading>
            <Text fontSize="sm" color="gray.600">
              {resort.nameJa ? `${resort.nameJa}（${resort.id}）` : resort.id}
            </Text>
          </Box>
          <Button size="sm" variant="outline" onClick={onBack}>
            詳細情報へ戻る
          </Button>
        </Flex>

        <Box borderWidth="1px" borderRadius="md" p={4} bg="white">
          <Flex direction="column" gap={4}>
            {RESORT_LINK_KEYS.map(key => (
              <LinkListField
                key={key}
                label={RESORT_LINK_LABELS[key]}
                values={links[key] ?? []}
                onChange={values => setLinks({ ...links, [key]: values })}
              />
            ))}
          </Flex>
        </Box>

        <Flex gap={3} pb={6}>
          <Button colorPalette="blue" onClick={onProceed}>
            次へ（確認・保存）
          </Button>
          <Button variant="outline" onClick={onBack}>
            戻る
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
