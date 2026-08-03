"use client";

import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Text,
  Textarea,
} from "@chakra-ui/react";
import {
  AlertTriangle,
  BookOpenText,
  Check,
  FileSearch,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import {
  REVIEW_CATEGORY_IDS,
  REVIEW_CATEGORY_LABELS,
  type ReviewArticleFile,
  type ReviewCategoryId,
  type ReviewDetailCourse,
  type ReviewDetailEvaluation,
  type ReviewDetailFile,
  type ReviewSource,
} from "@/features/reviews/types";
import { loadReviewForEdit, saveReviewFiles } from "./actions";
import type { ReviewEditData, ReviewResortOption } from "./types";

type EditorMode = "warnings" | "detail" | "article";
type WarningKind = "good" | "bad" | "courses";

type ReviewWarning = {
  categoryId: ReviewCategoryId;
  kind: WarningKind;
  index: number;
  label: string;
  reason: string;
};

const WARNING_KIND_LABELS: Record<WarningKind, string> = {
  good: "良い評価",
  bad: "悪い評価",
  courses: "コース",
};

const warningAnchorId = (
  categoryId: ReviewCategoryId,
  kind: WarningKind,
  index: number,
) => `review-warning-${categoryId}-${kind}-${index}`;

const panelStyle = {
  bg: "white",
  border: "1px solid",
  borderColor: "gray.200",
  borderRadius: "2xl",
};

const cloneSource = (): ReviewSource => ({ name: "", url: "", quote: "" });

const newEvaluation = (): ReviewDetailEvaluation => ({
  title: "",
  description: "",
  sources: [],
  warn: false,
  warnReason: null,
});

const newCourse = (): ReviewDetailCourse => ({
  name: "",
  description: "",
  sources: [],
  warn: false,
  warnReason: null,
});

const FieldLabel = ({
  children,
  required = false,
}: {
  children: React.ReactNode;
  required?: boolean;
}) => (
  <Text mb={1.5} color="gray.700" fontSize="xs" fontWeight="800">
    {children}
    {required && (
      <Box as="span" ml={1} color="red.600">
        必須
      </Box>
    )}
  </Text>
);

const SourcesEditor = ({
  sources,
  onChange,
}: {
  sources: ReviewSource[];
  onChange: (sources: ReviewSource[]) => void;
}) => (
  <Box mt={4}>
    <Flex alignItems="center" justifyContent="space-between">
      <Text color="gray.700" fontSize="xs" fontWeight="900">
        出典
      </Text>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={() => onChange([...sources, cloneSource()])}
      >
        <Plus size={14} />
        出典を追加
      </Button>
    </Flex>
    {sources.length === 0 ? (
      <Text mt={2} color="gray.400" fontSize="xs">
        出典は登録されていません。
      </Text>
    ) : (
      <Flex mt={2} flexDirection="column" gap={3}>
        {sources.map((source, index) => (
          <Box
            // biome-ignore lint/suspicious/noArrayIndexKey: The agreed JSON schema intentionally has no IDs.
            key={`${index}-${source.url}`}
            p={3}
            borderRadius="xl"
            bg="gray.50"
            border="1px solid"
            borderColor="gray.200"
          >
            <Flex gap={2} alignItems="start">
              <Box flex="1">
                <Input
                  size="sm"
                  value={source.name}
                  placeholder="出典名"
                  bg="white"
                  onChange={event => {
                    const next = [...sources];
                    next[index] = { ...source, name: event.target.value };
                    onChange(next);
                  }}
                />
                <Input
                  mt={2}
                  size="sm"
                  value={source.url}
                  placeholder="https://..."
                  bg="white"
                  onChange={event => {
                    const next = [...sources];
                    next[index] = { ...source, url: event.target.value };
                    onChange(next);
                  }}
                />
                <Textarea
                  mt={2}
                  size="sm"
                  minH="80px"
                  value={source.quote}
                  placeholder="確認に使用した原文"
                  bg="white"
                  onChange={event => {
                    const next = [...sources];
                    next[index] = { ...source, quote: event.target.value };
                    onChange(next);
                  }}
                />
              </Box>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                colorPalette="red"
                aria-label="出典を削除"
                onClick={() =>
                  onChange(
                    sources.filter((_, sourceIndex) => sourceIndex !== index),
                  )
                }
              >
                <Trash2 size={15} />
              </Button>
            </Flex>
          </Box>
        ))}
      </Flex>
    )}
  </Box>
);

const WarningEditor = ({
  warn,
  warnReason,
  onChange,
}: {
  warn: boolean;
  warnReason: string | null;
  onChange: (warn: boolean, warnReason: string | null) => void;
}) => (
  <Box mt={4} p={3} borderRadius="xl" bg={warn ? "orange.50" : "gray.50"}>
    <Flex as="label" alignItems="center" gap={2} cursor="pointer">
      <input
        type="checkbox"
        checked={warn}
        onChange={event =>
          onChange(event.target.checked, event.target.checked ? "" : null)
        }
      />
      <AlertTriangle size={16} color={warn ? "#c2410c" : "#6b7280"} />
      <Text
        color={warn ? "orange.900" : "gray.600"}
        fontSize="sm"
        fontWeight="800"
      >
        人間による確認が必要
      </Text>
    </Flex>
    {warn && (
      <Textarea
        mt={3}
        minH="90px"
        value={warnReason ?? ""}
        placeholder="なぜ人間による確認が必要なのかを入力"
        bg="white"
        onChange={event => onChange(true, event.target.value)}
      />
    )}
  </Box>
);

const EvaluationEditor = ({
  categoryId,
  kind,
  title,
  tone,
  items,
  onChange,
}: {
  categoryId: ReviewCategoryId;
  kind: "good" | "bad";
  title: string;
  tone: "green" | "orange";
  items: ReviewDetailEvaluation[];
  onChange: (items: ReviewDetailEvaluation[]) => void;
}) => (
  <Box {...panelStyle} p={{ base: 4, md: 5 }}>
    <Flex alignItems="center" justifyContent="space-between" gap={3}>
      <Heading size="md" color={`${tone}.800`}>
        {title}
      </Heading>
      <Button
        type="button"
        size="sm"
        colorPalette={tone}
        variant="outline"
        onClick={() => onChange([...items, newEvaluation()])}
      >
        <Plus size={16} />
        追加
      </Button>
    </Flex>
    {items.length === 0 ? (
      <Text mt={4} color="gray.400" fontSize="sm">
        項目はありません。
      </Text>
    ) : (
      <Flex mt={4} flexDirection="column" gap={4}>
        {items.map((item, index) => (
          <Box
            // biome-ignore lint/suspicious/noArrayIndexKey: The agreed JSON schema intentionally has no IDs.
            key={`${index}-${item.title}`}
            id={warningAnchorId(categoryId, kind, index)}
            scrollMarginTop="24px"
            p={4}
            borderRadius="xl"
            border="1px solid"
            borderColor={item.warn ? "orange.400" : `${tone}.100`}
            bg={item.warn ? "orange.50" : `${tone}.50`}
          >
            {item.warn && (
              <Flex
                mb={4}
                p={3}
                alignItems="start"
                gap={2}
                borderRadius="lg"
                bg="orange.100"
                color="orange.950"
              >
                <AlertTriangle size={18} />
                <Box>
                  <Text fontSize="xs" fontWeight="900">
                    人間による確認が必要です
                  </Text>
                  <Text mt={1} fontSize="xs" lineHeight="1.6">
                    {item.warnReason}
                  </Text>
                </Box>
              </Flex>
            )}
            <Flex alignItems="start" gap={3}>
              <Box flex="1">
                <FieldLabel required>見出し</FieldLabel>
                <Input
                  value={item.title}
                  bg="white"
                  onChange={event => {
                    const next = [...items];
                    next[index] = { ...item, title: event.target.value };
                    onChange(next);
                  }}
                />
              </Box>
              <Button
                type="button"
                mt={5}
                size="sm"
                variant="ghost"
                colorPalette="red"
                aria-label={`${title}を削除`}
                onClick={() =>
                  onChange(items.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <Trash2 size={17} />
              </Button>
            </Flex>
            <Box mt={3}>
              <FieldLabel required>説明</FieldLabel>
              <Textarea
                minH="140px"
                value={item.description}
                bg="white"
                onChange={event => {
                  const next = [...items];
                  next[index] = { ...item, description: event.target.value };
                  onChange(next);
                }}
              />
            </Box>
            <SourcesEditor
              sources={item.sources}
              onChange={sources => {
                const next = [...items];
                next[index] = { ...item, sources };
                onChange(next);
              }}
            />
            <WarningEditor
              warn={item.warn}
              warnReason={item.warnReason}
              onChange={(warn, warnReason) => {
                const next = [...items];
                next[index] = { ...item, warn, warnReason };
                onChange(next);
              }}
            />
          </Box>
        ))}
      </Flex>
    )}
  </Box>
);

const CoursesEditor = ({
  categoryId,
  courses,
  onChange,
}: {
  categoryId: ReviewCategoryId;
  courses: ReviewDetailCourse[];
  onChange: (courses: ReviewDetailCourse[]) => void;
}) => (
  <Box {...panelStyle} p={{ base: 4, md: 5 }}>
    <Flex alignItems="center" justifyContent="space-between" gap={3}>
      <Heading size="md" color="blue.800">
        コース
      </Heading>
      <Button
        type="button"
        size="sm"
        colorPalette="blue"
        variant="outline"
        onClick={() => onChange([...courses, newCourse()])}
      >
        <Plus size={16} />
        追加
      </Button>
    </Flex>
    {courses.length === 0 ? (
      <Text mt={4} color="gray.400" fontSize="sm">
        コースは登録されていません。
      </Text>
    ) : (
      <Flex mt={4} flexDirection="column" gap={4}>
        {courses.map((course, index) => (
          <Box
            // biome-ignore lint/suspicious/noArrayIndexKey: The agreed JSON schema intentionally has no IDs.
            key={`${index}-${course.name}`}
            id={warningAnchorId(categoryId, "courses", index)}
            scrollMarginTop="24px"
            p={4}
            borderRadius="xl"
            border="1px solid"
            borderColor={course.warn ? "orange.400" : "blue.100"}
            bg={course.warn ? "orange.50" : "blue.50"}
          >
            {course.warn && (
              <Flex
                mb={4}
                p={3}
                alignItems="start"
                gap={2}
                borderRadius="lg"
                bg="orange.100"
                color="orange.950"
              >
                <AlertTriangle size={18} />
                <Box>
                  <Text fontSize="xs" fontWeight="900">
                    人間による確認が必要です
                  </Text>
                  <Text mt={1} fontSize="xs" lineHeight="1.6">
                    {course.warnReason}
                  </Text>
                </Box>
              </Flex>
            )}
            <Flex alignItems="start" gap={3}>
              <Box flex="1">
                <FieldLabel required>コース名</FieldLabel>
                <Input
                  value={course.name}
                  bg="white"
                  onChange={event => {
                    const next = [...courses];
                    next[index] = { ...course, name: event.target.value };
                    onChange(next);
                  }}
                />
              </Box>
              <Button
                type="button"
                mt={5}
                size="sm"
                variant="ghost"
                colorPalette="red"
                aria-label="コースを削除"
                onClick={() =>
                  onChange(
                    courses.filter((_, courseIndex) => courseIndex !== index),
                  )
                }
              >
                <Trash2 size={17} />
              </Button>
            </Flex>
            <Box mt={3}>
              <FieldLabel required>説明</FieldLabel>
              <Textarea
                minH="130px"
                value={course.description}
                bg="white"
                onChange={event => {
                  const next = [...courses];
                  next[index] = {
                    ...course,
                    description: event.target.value,
                  };
                  onChange(next);
                }}
              />
            </Box>
            <SourcesEditor
              sources={course.sources}
              onChange={sources => {
                const next = [...courses];
                next[index] = { ...course, sources };
                onChange(next);
              }}
            />
            <WarningEditor
              warn={course.warn}
              warnReason={course.warnReason}
              onChange={(warn, warnReason) => {
                const next = [...courses];
                next[index] = { ...course, warn, warnReason };
                onChange(next);
              }}
            />
          </Box>
        ))}
      </Flex>
    )}
  </Box>
);

const ModeButton = ({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <Button
    type="button"
    size="sm"
    variant={active ? "solid" : "ghost"}
    colorPalette={active ? "blue" : "gray"}
    onClick={onClick}
  >
    {icon}
    {children}
  </Button>
);

export function ReviewEditWorkspace({
  resorts,
  initialResortId,
  initialData,
}: {
  resorts: ReviewResortOption[];
  initialResortId: string | null;
  initialData: ReviewEditData | null;
}) {
  const [selectedResortId, setSelectedResortId] = useState(initialResortId);
  const [data, setData] = useState(initialData);
  const [savedSnapshot, setSavedSnapshot] = useState(
    initialData ? JSON.stringify(initialData) : "",
  );
  const [selectedCategory, setSelectedCategory] =
    useState<ReviewCategoryId>("beginner");
  const [mode, setMode] = useState<EditorMode>("detail");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = data ? JSON.stringify(data) !== savedSnapshot : false;
  const filteredResorts = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("ja");
    if (!query) return resorts;
    return resorts.filter(
      resort =>
        resort.name.toLocaleLowerCase("ja").includes(query) ||
        resort.resortId.includes(query),
    );
  }, [filter, resorts]);
  const selectedResort = resorts.find(
    resort => resort.resortId === selectedResortId,
  );
  const warnings = useMemo<ReviewWarning[]>(() => {
    if (!data) return [];
    return REVIEW_CATEGORY_IDS.flatMap(categoryId => {
      const category = data.detail[categoryId];
      return (["good", "bad", "courses"] as const).flatMap(kind =>
        category[kind].flatMap((item, index) =>
          item.warn
            ? [
                {
                  categoryId,
                  kind,
                  index,
                  label: "title" in item ? item.title : item.name,
                  reason: item.warnReason ?? "警告理由が入力されていません。",
                },
              ]
            : [],
        ),
      );
    });
  }, [data]);
  const warningCountByCategory = useMemo(
    () =>
      Object.fromEntries(
        REVIEW_CATEGORY_IDS.map(categoryId => [
          categoryId,
          warnings.filter(warning => warning.categoryId === categoryId).length,
        ]),
      ) as Record<ReviewCategoryId, number>,
    [warnings],
  );

  const updateDetail = (detail: ReviewDetailFile) => {
    if (!data) return;
    setData({ ...data, detail });
    setMessage(null);
  };

  const updateArticle = (article: ReviewArticleFile) => {
    if (!data) return;
    setData({ ...data, article });
    setMessage(null);
  };

  const selectResort = (resortId: string) => {
    if (resortId === selectedResortId) return;
    if (
      dirty &&
      !window.confirm("保存していない変更があります。破棄して移動しますか？")
    ) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const next = await loadReviewForEdit(resortId);
        setSelectedResortId(resortId);
        setData(next);
        setSavedSnapshot(JSON.stringify(next));
      } catch {
        setMessage({
          tone: "error",
          text: "レビューデータを読み込めませんでした。",
        });
      }
    });
  };

  const save = () => {
    if (!data || !selectedResortId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await saveReviewFiles({
        resortId: selectedResortId,
        ...data,
      });
      if (result.ok) {
        setData(result.data);
        setSavedSnapshot(JSON.stringify(result.data));
        setMessage({ tone: "success", text: "2つのJSONを保存しました。" });
      } else {
        setMessage({ tone: "error", text: result.errors.join("\n") });
      }
    });
  };

  const openWarning = (warning: ReviewWarning) => {
    setSelectedCategory(warning.categoryId);
    setMode("detail");
    window.setTimeout(() => {
      document
        .getElementById(
          warningAnchorId(warning.categoryId, warning.kind, warning.index),
        )
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const detailCategory = data?.detail[selectedCategory];
  const articleCategory = data?.article[selectedCategory];

  return (
    <Flex h="100dvh" bg="#f3f6f8" color="gray.900" overflow="hidden">
      <Box
        as="aside"
        w={{ base: "230px", lg: "280px" }}
        flexShrink={0}
        bg="#102a43"
        color="white"
        overflowY="auto"
        borderRight="1px solid"
        borderColor="whiteAlpha.200"
      >
        <Box p={5} position="sticky" top={0} zIndex={1} bg="#102a43">
          <Text color="blue.200" fontSize="xs" fontWeight="900">
            RUSUTSU DATA TOOLS
          </Text>
          <Heading mt={1} size="lg">
            レビュー編集
          </Heading>
          <Input
            mt={4}
            size="sm"
            value={filter}
            placeholder="スキー場を検索"
            bg="white"
            color="gray.900"
            borderColor="transparent"
            onChange={event => setFilter(event.target.value)}
          />
        </Box>
        <Flex px={3} pb={6} flexDirection="column" gap={1}>
          {filteredResorts.map(resort => {
            const selected = selectedResortId === resort.resortId;
            return (
              <Button
                key={resort.resortId}
                type="button"
                h="auto"
                minH="58px"
                px={3}
                py={2.5}
                justifyContent="start"
                textAlign="left"
                whiteSpace="normal"
                bg={selected ? "blue.500" : "transparent"}
                color="white"
                _hover={{ bg: selected ? "blue.500" : "whiteAlpha.200" }}
                disabled={isPending}
                onClick={() => selectResort(resort.resortId)}
              >
                <Box width="100%">
                  <Flex alignItems="center" justifyContent="space-between">
                    <Text fontSize="sm" fontWeight="800">
                      {resort.name}
                    </Text>
                    {resort.warningCount > 0 && (
                      <Flex
                        alignItems="center"
                        gap={1}
                        color="orange.200"
                        fontSize="xs"
                      >
                        <AlertTriangle size={13} />
                        {resort.warningCount}
                      </Flex>
                    )}
                  </Flex>
                  <Text
                    mt={1}
                    color={selected ? "blue.100" : "gray.400"}
                    fontSize="0.68rem"
                  >
                    {resort.resortId}
                  </Text>
                </Box>
              </Button>
            );
          })}
        </Flex>
      </Box>

      <Flex minW={0} flex="1" flexDirection="column">
        <Flex
          as="header"
          px={{ base: 4, lg: 7 }}
          py={3}
          alignItems="center"
          justifyContent="space-between"
          gap={4}
          bg="white"
          borderBottom="1px solid"
          borderColor="gray.200"
        >
          <Box minW={0}>
            <Text color="gray.500" fontSize="xs" fontWeight="800">
              {selectedResortId ?? "スキー場未選択"}
            </Text>
            <Heading size="md" lineClamp={1}>
              {selectedResort?.name ?? "レビューデータがありません"}
            </Heading>
          </Box>
          <Flex alignItems="center" gap={3}>
            {dirty && (
              <Text color="orange.700" fontSize="xs" fontWeight="800">
                未保存
              </Text>
            )}
            <Button
              type="button"
              colorPalette="blue"
              disabled={!data || !dirty || isPending}
              onClick={save}
            >
              <Save size={17} />
              保存
            </Button>
          </Flex>
        </Flex>

        <Box px={{ base: 4, lg: 7 }} pt={4} bg="white">
          <Flex alignItems="center" justifyContent="space-between" gap={4}>
            <Flex gap={1}>
              <ModeButton
                active={mode === "warnings"}
                icon={<AlertTriangle size={17} />}
                onClick={() => setMode("warnings")}
              >
                警告一覧
                {warnings.length > 0 && (
                  <Box
                    as="span"
                    ml={1}
                    px={1.5}
                    borderRadius="full"
                    bg={mode === "warnings" ? "whiteAlpha.300" : "orange.100"}
                    color={mode === "warnings" ? "white" : "orange.800"}
                    fontSize="0.68rem"
                  >
                    {warnings.length}
                  </Box>
                )}
              </ModeButton>
              <ModeButton
                active={mode === "detail"}
                icon={<FileSearch size={17} />}
                onClick={() => setMode("detail")}
              >
                調査詳細
              </ModeButton>
              <ModeButton
                active={mode === "article"}
                icon={<BookOpenText size={17} />}
                onClick={() => setMode("article")}
              >
                記事
              </ModeButton>
            </Flex>
            {message && (
              <Flex
                alignItems="center"
                gap={2}
                color={message.tone === "success" ? "green.700" : "red.700"}
              >
                {message.tone === "success" && <Check size={16} />}
                <Text whiteSpace="pre-wrap" fontSize="xs" fontWeight="800">
                  {message.text}
                </Text>
              </Flex>
            )}
          </Flex>
          <Flex
            mt={3}
            gap={1}
            overflowX="auto"
            borderBottom="1px solid"
            borderColor="gray.200"
          >
            {REVIEW_CATEGORY_IDS.map(categoryId => (
              <Button
                key={categoryId}
                type="button"
                flexShrink={0}
                size="sm"
                borderRadius="lg lg 0 0"
                variant={selectedCategory === categoryId ? "solid" : "ghost"}
                colorPalette={selectedCategory === categoryId ? "blue" : "gray"}
                onClick={() => setSelectedCategory(categoryId)}
              >
                {REVIEW_CATEGORY_LABELS[categoryId]}
                {warningCountByCategory[categoryId] > 0 && (
                  <Flex
                    as="span"
                    minW={5}
                    h={5}
                    px={1}
                    alignItems="center"
                    justifyContent="center"
                    borderRadius="full"
                    bg="orange.100"
                    color="orange.800"
                    fontSize="0.65rem"
                    fontWeight="900"
                  >
                    {warningCountByCategory[categoryId]}
                  </Flex>
                )}
              </Button>
            ))}
          </Flex>
        </Box>

        <Box flex="1" overflowY="auto" p={{ base: 4, lg: 7 }}>
          {!data || !detailCategory || !articleCategory ? (
            <Text color="gray.500">編集するスキー場を選択してください。</Text>
          ) : mode === "warnings" ? (
            <Flex flexDirection="column" gap={4} maxW="1000px" mx="auto">
              <Box {...panelStyle} p={{ base: 4, md: 5 }}>
                <Flex alignItems="center" gap={3}>
                  <Flex
                    w={10}
                    h={10}
                    alignItems="center"
                    justifyContent="center"
                    borderRadius="xl"
                    bg={warnings.length > 0 ? "orange.100" : "green.100"}
                    color={warnings.length > 0 ? "orange.800" : "green.800"}
                  >
                    {warnings.length > 0 ? (
                      <AlertTriangle size={21} />
                    ) : (
                      <Check size={21} />
                    )}
                  </Flex>
                  <Box>
                    <Heading size="md">警告一覧</Heading>
                    <Text mt={1} color="gray.600" fontSize="sm">
                      {warnings.length > 0
                        ? `人間による確認が必要な項目が${warnings.length}件あります。`
                        : "人間による確認が必要な項目はありません。"}
                    </Text>
                  </Box>
                </Flex>
              </Box>
              {warnings.map(warning => (
                <Button
                  key={warningAnchorId(
                    warning.categoryId,
                    warning.kind,
                    warning.index,
                  )}
                  type="button"
                  h="auto"
                  p={0}
                  display="block"
                  textAlign="left"
                  whiteSpace="normal"
                  bg="transparent"
                  _hover={{ bg: "transparent" }}
                  onClick={() => openWarning(warning)}
                >
                  <Box
                    {...panelStyle}
                    width="100%"
                    p={{ base: 4, md: 5 }}
                    borderColor="orange.300"
                    _hover={{
                      borderColor: "orange.500",
                      boxShadow: "md",
                    }}
                  >
                    <Flex alignItems="start" gap={3}>
                      <AlertTriangle size={19} color="#c2410c" />
                      <Box flex="1">
                        <Flex alignItems="center" gap={2} flexWrap="wrap">
                          <Text
                            px={2}
                            py={0.5}
                            borderRadius="full"
                            bg="blue.50"
                            color="blue.800"
                            fontSize="xs"
                            fontWeight="900"
                          >
                            {REVIEW_CATEGORY_LABELS[warning.categoryId]}
                          </Text>
                          <Text
                            px={2}
                            py={0.5}
                            borderRadius="full"
                            bg="gray.100"
                            color="gray.700"
                            fontSize="xs"
                            fontWeight="800"
                          >
                            {WARNING_KIND_LABELS[warning.kind]}
                          </Text>
                        </Flex>
                        <Text mt={3} color="gray.900" fontWeight="900">
                          {warning.label || "見出し未入力"}
                        </Text>
                        <Text
                          mt={2}
                          color="orange.900"
                          fontSize="sm"
                          lineHeight="1.7"
                        >
                          {warning.reason}
                        </Text>
                        <Text
                          mt={3}
                          color="blue.700"
                          fontSize="xs"
                          fontWeight="800"
                        >
                          調査詳細の該当項目を開く
                        </Text>
                      </Box>
                    </Flex>
                  </Box>
                </Button>
              ))}
            </Flex>
          ) : mode === "detail" ? (
            <Flex flexDirection="column" gap={5} maxW="1100px" mx="auto">
              {warningCountByCategory[selectedCategory] > 0 && (
                <Flex
                  p={4}
                  alignItems="start"
                  gap={3}
                  borderRadius="2xl"
                  bg="orange.100"
                  border="1px solid"
                  borderColor="orange.300"
                  color="orange.950"
                >
                  <AlertTriangle size={20} />
                  <Box>
                    <Text fontSize="sm" fontWeight="900">
                      このカテゴリには確認が必要な項目が
                      {warningCountByCategory[selectedCategory]}件あります
                    </Text>
                    <Text mt={1} fontSize="xs">
                      オレンジ色のカードに警告理由を表示しています。
                    </Text>
                  </Box>
                </Flex>
              )}
              <Box {...panelStyle} p={{ base: 4, md: 5 }}>
                <Heading size="md">調査情報</Heading>
                <Flex
                  mt={4}
                  gap={4}
                  flexDirection={{ base: "column", md: "row" }}
                >
                  <Box w={{ base: "100%", md: "220px" }}>
                    <FieldLabel>調査日</FieldLabel>
                    <Input
                      type="date"
                      value={data.detail.research.date}
                      onChange={event =>
                        updateDetail({
                          ...data.detail,
                          research: {
                            ...data.detail.research,
                            date: event.target.value,
                          },
                        })
                      }
                    />
                  </Box>
                  <Box flex="1">
                    <FieldLabel>調査に関する報告</FieldLabel>
                    <Textarea
                      minH="130px"
                      value={data.detail.research.note}
                      onChange={event =>
                        updateDetail({
                          ...data.detail,
                          research: {
                            ...data.detail.research,
                            note: event.target.value,
                          },
                        })
                      }
                    />
                  </Box>
                </Flex>
              </Box>
              <EvaluationEditor
                categoryId={selectedCategory}
                kind="good"
                title="良い評価"
                tone="green"
                items={detailCategory.good}
                onChange={good =>
                  updateDetail({
                    ...data.detail,
                    [selectedCategory]: { ...detailCategory, good },
                  })
                }
              />
              <EvaluationEditor
                categoryId={selectedCategory}
                kind="bad"
                title="悪い評価"
                tone="orange"
                items={detailCategory.bad}
                onChange={bad =>
                  updateDetail({
                    ...data.detail,
                    [selectedCategory]: { ...detailCategory, bad },
                  })
                }
              />
              <CoursesEditor
                categoryId={selectedCategory}
                courses={detailCategory.courses}
                onChange={courses =>
                  updateDetail({
                    ...data.detail,
                    [selectedCategory]: { ...detailCategory, courses },
                  })
                }
              />
            </Flex>
          ) : (
            <Flex flexDirection="column" gap={5} maxW="1000px" mx="auto">
              <Box {...panelStyle} p={{ base: 4, md: 5 }}>
                <FieldLabel>スキー場全体の記事（full）</FieldLabel>
                <Textarea
                  minH="260px"
                  value={data.article.full}
                  onChange={event =>
                    updateArticle({
                      ...data.article,
                      full: event.target.value,
                    })
                  }
                />
              </Box>
              <Box {...panelStyle} p={{ base: 4, md: 5 }}>
                <Flex alignItems="end" gap={4}>
                  <Box>
                    <FieldLabel>評価</FieldLabel>
                    <select
                      style={{
                        height: 40,
                        minWidth: 110,
                        padding: "0 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        background: "white",
                      }}
                      value={articleCategory.score ?? ""}
                      onChange={event =>
                        updateArticle({
                          ...data.article,
                          [selectedCategory]: {
                            ...articleCategory,
                            score:
                              (event.target.value as "◎" | "○" | "△") || null,
                          },
                        })
                      }
                    >
                      <option value="">未評価</option>
                      <option value="◎">◎</option>
                      <option value="○">○</option>
                      <option value="△">△</option>
                    </select>
                  </Box>
                  <Box>
                    <Text color="gray.500" fontSize="sm">
                      {REVIEW_CATEGORY_LABELS[selectedCategory]}向け記事
                    </Text>
                  </Box>
                </Flex>
                <Box mt={5}>
                  <FieldLabel>良い点（good）</FieldLabel>
                  <Textarea
                    minH="180px"
                    value={articleCategory.good}
                    onChange={event =>
                      updateArticle({
                        ...data.article,
                        [selectedCategory]: {
                          ...articleCategory,
                          good: event.target.value,
                        },
                      })
                    }
                  />
                </Box>
                <Box mt={5}>
                  <FieldLabel>悪い点（bad）</FieldLabel>
                  <Textarea
                    minH="180px"
                    value={articleCategory.bad}
                    onChange={event =>
                      updateArticle({
                        ...data.article,
                        [selectedCategory]: {
                          ...articleCategory,
                          bad: event.target.value,
                        },
                      })
                    }
                  />
                </Box>
                <Box mt={5}>
                  <Flex alignItems="center" justifyContent="space-between">
                    <FieldLabel>コース（courses）</FieldLabel>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateArticle({
                          ...data.article,
                          [selectedCategory]: {
                            ...articleCategory,
                            courses: [
                              ...articleCategory.courses,
                              { name: "", description: "" },
                            ],
                          },
                        })
                      }
                    >
                      <Plus size={15} />
                      コースを追加
                    </Button>
                  </Flex>
                  <Flex mt={2} flexDirection="column" gap={3}>
                    {articleCategory.courses.map((course, index) => (
                      <Box
                        // biome-ignore lint/suspicious/noArrayIndexKey: The agreed JSON schema intentionally has no IDs.
                        key={`${index}-${course.name}`}
                        p={3}
                        borderRadius="xl"
                        border="1px solid"
                        borderColor="gray.200"
                        bg="gray.50"
                      >
                        <Flex gap={2} alignItems="start">
                          <Box flex="1">
                            <Input
                              value={course.name}
                              placeholder="コース名"
                              bg="white"
                              onChange={event => {
                                const courses = [...articleCategory.courses];
                                courses[index] = {
                                  ...course,
                                  name: event.target.value,
                                };
                                updateArticle({
                                  ...data.article,
                                  [selectedCategory]: {
                                    ...articleCategory,
                                    courses,
                                  },
                                });
                              }}
                            />
                            <Textarea
                              mt={2}
                              minH="110px"
                              value={course.description}
                              placeholder="記事用のコース説明"
                              bg="white"
                              onChange={event => {
                                const courses = [...articleCategory.courses];
                                courses[index] = {
                                  ...course,
                                  description: event.target.value,
                                };
                                updateArticle({
                                  ...data.article,
                                  [selectedCategory]: {
                                    ...articleCategory,
                                    courses,
                                  },
                                });
                              }}
                            />
                          </Box>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            colorPalette="red"
                            aria-label="記事のコースを削除"
                            onClick={() =>
                              updateArticle({
                                ...data.article,
                                [selectedCategory]: {
                                  ...articleCategory,
                                  courses: articleCategory.courses.filter(
                                    (_, courseIndex) => courseIndex !== index,
                                  ),
                                },
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </Button>
                        </Flex>
                      </Box>
                    ))}
                  </Flex>
                </Box>
              </Box>
            </Flex>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}
