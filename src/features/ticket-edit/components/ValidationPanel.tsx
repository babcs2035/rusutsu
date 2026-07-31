"use client";

import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { AlertTriangle, Check, RefreshCw, ShieldCheck } from "lucide-react";
import type { ValidationIssue, ValidationReport } from "../types";

const CHECK_LABELS: Record<string, string> = {
  schema: "構造（JSON Schema）",
  taxonomy: "標準ラベル・データ規則",
  coverage: "根拠・網羅性",
};

const IssueList = ({
  issues,
  level,
}: {
  issues: ValidationIssue[];
  level: "error" | "warning";
}) => {
  const target = issues.filter(issue => issue.level === level);
  if (target.length === 0) return null;
  const isError = level === "error";
  return (
    <Box
      p={4}
      borderRadius="xl"
      bg={isError ? "red.50" : "orange.50"}
      border="1px solid"
      borderColor={isError ? "red.300" : "orange.300"}
    >
      <Flex alignItems="center" gap={2}>
        <AlertTriangle size={17} color={isError ? "#dc2626" : "#c2410c"} />
        <Text
          color={isError ? "red.800" : "orange.900"}
          fontSize="sm"
          fontWeight="900"
        >
          {isError ? "エラー" : "警告"} {target.length}件
        </Text>
        {!isError && (
          <Text color="orange.800" fontSize="xs">
            保存は可能ですが、人間の判断が必要な指摘です。
          </Text>
        )}
      </Flex>
      <Flex mt={3} flexDirection="column" gap={2}>
        {target.map((issue, index) => (
          <Box
            // biome-ignore lint/suspicious/noArrayIndexKey: 検証スクリプトの出力順をそのまま出す。
            key={`${issue.check}-${index}`}
            p={3}
            borderRadius="lg"
            bg="white"
            border="1px solid"
            borderColor={isError ? "red.200" : "orange.200"}
          >
            <Flex alignItems="baseline" gap={2} flexWrap="wrap">
              <Text
                px={1.5}
                py={0.5}
                borderRadius="full"
                bg={isError ? "red.100" : "orange.100"}
                color={isError ? "red.800" : "orange.900"}
                fontSize="0.62rem"
                fontWeight="900"
              >
                {CHECK_LABELS[issue.check] ?? issue.check}
              </Text>
              <Text color="gray.600" fontSize="0.66rem" fontFamily="mono">
                {issue.path}
              </Text>
            </Flex>
            <Text mt={1.5} color="gray.900" fontSize="xs" lineHeight="1.8">
              {issue.message}
            </Text>
          </Box>
        ))}
      </Flex>
    </Box>
  );
};

export const ValidationPanel = ({
  report,
  localIssues,
  isPending,
  onRun,
}: {
  report: ValidationReport | null;
  /** 画面側でしか分からない指摘（ID重複・存在しない参照） */
  localIssues: string[];
  isPending: boolean;
  onRun: () => void;
}) => {
  const errorCount =
    report?.issues.filter(issue => issue.level === "error").length ?? 0;

  return (
    <Flex flexDirection="column" gap={4} maxW="1000px" mx="auto">
      <Box
        p={{ base: 4, md: 5 }}
        borderRadius="2xl"
        bg="white"
        border="1px solid"
        borderColor="gray.200"
      >
        <Flex
          alignItems="start"
          justifyContent="space-between"
          gap={4}
          flexWrap="wrap"
        >
          <Box flex="1" minW="240px">
            <Flex alignItems="center" gap={2}>
              <ShieldCheck size={19} />
              <Heading size="md">検証</Heading>
            </Flex>
            <Text mt={2} color="gray.600" fontSize="xs" lineHeight="1.8">
              collect-ski-lift-ticket-pricing Skill が持つ検証3本
              （validate-lift-ticket / check-taxonomy /
              check-lift-ticket-coverage）をそのまま実行します。
              構造とラベル体系の正本はSkill側にあるため、
              <Box as="span" fontWeight="900">
                エラーが1件でもあると保存されません
              </Box>
              。
            </Text>
          </Box>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={onRun}
          >
            <RefreshCw size={15} />
            いま検証する
          </Button>
        </Flex>
      </Box>

      {localIssues.length > 0 && (
        <Box
          p={4}
          borderRadius="xl"
          bg="red.50"
          border="1px solid"
          borderColor="red.300"
        >
          <Flex alignItems="center" gap={2}>
            <AlertTriangle size={17} color="#dc2626" />
            <Text color="red.800" fontSize="sm" fontWeight="900">
              ID の不整合 {localIssues.length}件
            </Text>
          </Flex>
          <Flex mt={2} flexDirection="column" gap={1}>
            {localIssues.map(issue => (
              <Text key={issue} color="red.900" fontSize="xs" fontFamily="mono">
                {issue}
              </Text>
            ))}
          </Flex>
        </Box>
      )}

      {report === null ? (
        <Text color="gray.500" fontSize="sm">
          まだ検証していません。「いま検証する」を押すか、保存すると実行されます。
        </Text>
      ) : report.failedToRun !== null ? (
        <Box
          p={4}
          borderRadius="xl"
          bg="red.50"
          border="1px solid"
          borderColor="red.300"
        >
          <Text color="red.800" fontSize="sm" fontWeight="900">
            検証を実行できませんでした
          </Text>
          <Text mt={2} color="red.900" fontSize="xs" whiteSpace="pre-wrap">
            {report.failedToRun}
          </Text>
        </Box>
      ) : (
        <>
          {errorCount === 0 && (
            <Flex
              p={4}
              alignItems="center"
              gap={2}
              borderRadius="xl"
              bg="green.50"
              border="1px solid"
              borderColor="green.300"
            >
              <Check size={18} color="#15803d" />
              <Text color="green.900" fontSize="sm" fontWeight="900">
                検証3本ともエラーはありません。
              </Text>
            </Flex>
          )}
          <IssueList issues={report.issues} level="error" />
          <IssueList issues={report.issues} level="warning" />
          <Text color="gray.400" fontSize="0.66rem">
            検証時刻: {report.checkedAt}
          </Text>
        </>
      )}
    </Flex>
  );
};
