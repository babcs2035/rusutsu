"use client";

import { Box, Button, Flex, Heading, Input, Text } from "@chakra-ui/react";
import {
  AlertTriangle,
  Check,
  FileJson,
  Save,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { loadTicketForEdit, saveTicketFile, validateTicket } from "./actions";
import { CollectionSection } from "./components/CollectionSection";
import { EditorProvider, ObjectFields } from "./components/FieldRenderer";
import { ValidationPanel } from "./components/ValidationPanel";
import { loadDraft, useDraftStorage } from "./hooks/useDraftStorage";
import { labelOf, TICKET_SECTIONS } from "./presentation";
import type {
  EnumLabelCatalog,
  FieldSpec,
  TicketDocument,
  TicketEditData,
  TicketFileOption,
  TicketSchemaSpec,
  ValidationReport,
} from "./types";
import { type NodePath, type NodeUpdate, setAtPath } from "./utils/nodeOps";
import {
  buildIdIndex,
  findDanglingReferences,
  findDuplicateIds,
} from "./utils/references";

type ResortOption = { id: string; name: string };

const STATUS_LABELS: Record<string, string> = {
  complete: "確定",
  needs_review: "要確認",
  failed: "取得失敗",
};

const STATUS_COLORS: Record<string, string> = {
  complete: "green.200",
  needs_review: "orange.200",
  failed: "red.200",
};

const fileKeyOf = (resortId: string, fileName: string) =>
  `${resortId}/${fileName}`;

export function TicketEditWorkspace({
  files,
  resortOptions,
  schemaSpec,
  enumLabels,
  initialData,
}: {
  files: TicketFileOption[];
  resortOptions: ResortOption[];
  schemaSpec: TicketSchemaSpec;
  enumLabels: EnumLabelCatalog;
  initialData: TicketEditData | null;
}) {
  const [selected, setSelected] = useState<{
    resortId: string;
    fileName: string;
  } | null>(
    initialData
      ? { resortId: initialData.resortId, fileName: initialData.fileName }
      : null,
  );
  const [data, setData] = useState<TicketDocument | null>(
    initialData?.data ?? null,
  );
  const [fileHash, setFileHash] = useState<string | null>(
    initialData?.fileHash ?? null,
  );
  const [savedSnapshot, setSavedSnapshot] = useState(
    initialData ? JSON.stringify(initialData.data) : "",
  );
  const [sectionId, setSectionId] = useState("overview");
  const [filter, setFilter] = useState("");
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = data !== null && JSON.stringify(data) !== savedSnapshot;
  const draft = useDraftStorage(
    selected?.resortId ?? null,
    selected?.fileName ?? null,
    fileHash,
    data,
    dirty,
  );

  const filteredFiles = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("ja");
    if (query === "") return files;
    return files.filter(file =>
      [file.resortName, file.resortId, file.fileName, file.seasonLabelJa ?? ""]
        .join(" ")
        .toLocaleLowerCase("ja")
        .includes(query),
    );
  }, [files, filter]);

  const selectedFile = files.find(
    file =>
      selected !== null &&
      file.resortId === selected.resortId &&
      file.fileName === selected.fileName,
  );

  const idIndex = useMemo(() => buildIdIndex(data ?? {}), [data]);
  const localIssues = useMemo(
    () =>
      data === null
        ? []
        : [...findDuplicateIds(data), ...findDanglingReferences(data)],
    [data],
  );

  const update = useCallback((path: NodePath, value: NodeUpdate) => {
    setData(current =>
      current === null ? current : setAtPath(current, path, value),
    );
    setMessage(null);
    setReport(null);
  }, []);

  const editorValue = useMemo(
    () => ({ idIndex, enumLabels, resortOptions, update }),
    [idIndex, enumLabels, resortOptions, update],
  );

  const openFile = (resortId: string, fileName: string) => {
    if (selected?.resortId === resortId && selected?.fileName === fileName) {
      return;
    }
    if (
      dirty &&
      !window.confirm("保存していない変更があります。破棄して移動しますか？")
    ) {
      return;
    }
    setMessage(null);
    setReport(null);
    startTransition(async () => {
      try {
        const next = await loadTicketForEdit(resortId, fileName);
        const stored = loadDraft(resortId, fileName);
        const useDraftData =
          stored !== null &&
          stored.fileHash === next.fileHash &&
          JSON.stringify(stored.data) !== JSON.stringify(next.data) &&
          window.confirm(
            `このファイルには未保存の下書き（${stored.updatedAt}）があります。下書きから再開しますか？\nいいえを選ぶとファイルの内容を読み込みます。`,
          );
        setSelected({ resortId, fileName });
        setData(useDraftData ? stored.data : next.data);
        setFileHash(next.fileHash);
        setSavedSnapshot(JSON.stringify(next.data));
        setSectionId("overview");
      } catch {
        setMessage({
          tone: "error",
          text: "リフト券JSONを読み込めませんでした。",
        });
      }
    });
  };

  const runValidation = () => {
    if (data === null) return;
    setMessage(null);
    startTransition(async () => {
      setReport(await validateTicket(data));
    });
  };

  const save = () => {
    if (data === null || selected === null || fileHash === null) return;
    setMessage(null);
    startTransition(async () => {
      const result = await saveTicketFile({
        resortId: selected.resortId,
        fileName: selected.fileName,
        data,
        fileHash,
      });
      setReport(result.ok ? result.report : (result.report ?? null));
      if (result.ok) {
        setData(result.data.data);
        setFileHash(result.data.fileHash);
        setSavedSnapshot(JSON.stringify(result.data.data));
        draft.markSavedToServer();
        const warnings = result.report.issues.filter(
          issue => issue.level === "warning",
        ).length;
        setMessage({
          tone: "success",
          text:
            warnings === 0
              ? "検証を通過し、保存しました。"
              : `検証を通過し、保存しました。警告が${warnings}件あります（「検証」タブで確認できます）。`,
        });
      } else {
        setMessage({ tone: "error", text: result.errors.join("\n") });
        // 何を直せばよいかは検証結果にしか書かれていないので、そこへ移す
        if (result.report !== null) setSectionId("validation");
      }
    });
  };

  const revert = () => {
    if (savedSnapshot === "" || !dirty) return;
    if (!window.confirm("編集内容を破棄してファイルの内容に戻しますか？"))
      return;
    setData(JSON.parse(savedSnapshot) as TicketDocument);
    draft.discard();
    setMessage(null);
    setReport(null);
  };

  const section = TICKET_SECTIONS.find(item => item.id === sectionId);
  const fieldSpecOf = (key: string): FieldSpec | null =>
    schemaSpec.fields.find(field => field.key === key)?.spec ?? null;

  const countOf = (key: string): number | null => {
    const value = data?.[key];
    return Array.isArray(value) ? value.length : null;
  };

  return (
    <Flex h="100dvh" bg="#f3f6f8" color="gray.900" overflow="hidden">
      <Box
        as="aside"
        w={{ base: "250px", lg: "300px" }}
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
            リフト券編集
          </Heading>
          <Input
            mt={4}
            size="sm"
            value={filter}
            placeholder="スキー場・シーズンを検索"
            bg="white"
            color="gray.900"
            borderColor="transparent"
            onChange={event => setFilter(event.target.value)}
          />
        </Box>
        <Flex px={3} pb={6} flexDirection="column" gap={1}>
          {filteredFiles.length === 0 ? (
            <Text px={2} color="gray.400" fontSize="xs">
              編集できるリフト券JSONがありません。
            </Text>
          ) : (
            filteredFiles.map(file => {
              const isSelected =
                selected?.resortId === file.resortId &&
                selected?.fileName === file.fileName;
              return (
                <Button
                  key={fileKeyOf(file.resortId, file.fileName)}
                  type="button"
                  h="auto"
                  minH="64px"
                  px={3}
                  py={2.5}
                  justifyContent="start"
                  textAlign="left"
                  whiteSpace="normal"
                  bg={isSelected ? "blue.500" : "transparent"}
                  color="white"
                  _hover={{ bg: isSelected ? "blue.500" : "whiteAlpha.200" }}
                  disabled={isPending}
                  onClick={() => openFile(file.resortId, file.fileName)}
                >
                  <Box width="100%">
                    <Flex
                      alignItems="center"
                      justifyContent="space-between"
                      gap={2}
                    >
                      <Text fontSize="sm" fontWeight="800">
                        {file.resortName}
                      </Text>
                      {file.status !== null && (
                        <Text
                          px={1.5}
                          borderRadius="full"
                          bg="whiteAlpha.200"
                          color={STATUS_COLORS[file.status] ?? "gray.200"}
                          fontSize="0.62rem"
                          fontWeight="900"
                        >
                          {STATUS_LABELS[file.status] ?? file.status}
                        </Text>
                      )}
                    </Flex>
                    <Flex mt={1} gap={1.5} alignItems="center" flexWrap="wrap">
                      <Text
                        color={isSelected ? "blue.100" : "gray.400"}
                        fontSize="0.68rem"
                      >
                        {file.seasonId}
                      </Text>
                      {file.isDraft && (
                        <Text
                          px={1.5}
                          borderRadius="full"
                          bg="whiteAlpha.300"
                          fontSize="0.6rem"
                          fontWeight="900"
                        >
                          草案
                        </Text>
                      )}
                      <Text
                        color={isSelected ? "blue.100" : "gray.500"}
                        fontSize="0.62rem"
                      >
                        料金{file.offerCount}件
                      </Text>
                      {file.humanReviewCount > 0 && (
                        <Flex
                          alignItems="center"
                          gap={0.5}
                          color="orange.200"
                          fontSize="0.62rem"
                        >
                          <AlertTriangle size={11} />
                          {file.humanReviewCount}
                        </Flex>
                      )}
                    </Flex>
                  </Box>
                </Button>
              );
            })
          )}
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
              {selected === null
                ? "ファイル未選択"
                : `${selected.resortId} / tickets/${selected.fileName}`}
            </Text>
            <Heading size="md" lineClamp={1}>
              {selectedFile
                ? `${selectedFile.resortName}　${selectedFile.seasonLabelJa ?? selectedFile.seasonId}`
                : "リフト券JSONを選択してください"}
            </Heading>
          </Box>
          <Flex alignItems="center" gap={3}>
            {draft.savedAt !== null && (
              <Text color="gray.500" fontSize="0.66rem">
                下書き保存済み
              </Text>
            )}
            {dirty && (
              <Text color="orange.700" fontSize="xs" fontWeight="800">
                未保存
              </Text>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!dirty || isPending}
              onClick={revert}
            >
              <Undo2 size={16} />
              元に戻す
            </Button>
            <Button
              type="button"
              colorPalette="blue"
              disabled={data === null || !dirty || isPending}
              onClick={save}
            >
              <Save size={17} />
              検証して保存
            </Button>
          </Flex>
        </Flex>

        <Box px={{ base: 4, lg: 7 }} pt={3} bg="white">
          {message && (
            <Flex
              mb={2}
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
          <Flex
            gap={1}
            overflowX="auto"
            borderBottom="1px solid"
            borderColor="gray.200"
          >
            {TICKET_SECTIONS.map(item => {
              const count =
                item.kind === "array" ? countOf(item.keys[0]) : null;
              return (
                <Button
                  key={item.id}
                  type="button"
                  flexShrink={0}
                  size="sm"
                  borderRadius="lg lg 0 0"
                  variant={sectionId === item.id ? "solid" : "ghost"}
                  colorPalette={sectionId === item.id ? "blue" : "gray"}
                  onClick={() => setSectionId(item.id)}
                >
                  {item.title}
                  {count !== null && (
                    <Box as="span" ml={1} fontSize="0.66rem" opacity={0.8}>
                      {count}
                    </Box>
                  )}
                </Button>
              );
            })}
            <Button
              type="button"
              flexShrink={0}
              size="sm"
              borderRadius="lg lg 0 0"
              variant={sectionId === "validation" ? "solid" : "ghost"}
              colorPalette={sectionId === "validation" ? "blue" : "gray"}
              onClick={() => setSectionId("validation")}
            >
              <ShieldCheck size={15} />
              検証
              {localIssues.length > 0 && (
                <Box
                  as="span"
                  ml={1}
                  px={1.5}
                  borderRadius="full"
                  bg="red.100"
                  color="red.800"
                  fontSize="0.62rem"
                >
                  {localIssues.length}
                </Box>
              )}
            </Button>
            <Button
              type="button"
              flexShrink={0}
              size="sm"
              borderRadius="lg lg 0 0"
              variant={sectionId === "json" ? "solid" : "ghost"}
              colorPalette={sectionId === "json" ? "blue" : "gray"}
              onClick={() => setSectionId("json")}
            >
              <FileJson size={15} />
              JSON
            </Button>
          </Flex>
        </Box>

        <Box flex="1" overflowY="auto" p={{ base: 4, lg: 7 }}>
          {data === null ? (
            <Text color="gray.500">
              左の一覧から編集するリフト券JSONを選択してください。
            </Text>
          ) : (
            <EditorProvider value={editorValue}>
              {sectionId === "validation" ? (
                <ValidationPanel
                  report={report}
                  localIssues={localIssues}
                  isPending={isPending}
                  onRun={runValidation}
                />
              ) : sectionId === "json" ? (
                <Box maxW="1000px" mx="auto">
                  <Text mb={2} color="gray.600" fontSize="xs">
                    保存時に書き出される内容です（読み取り専用）。キー順序は元ファイルのまま保たれます。
                  </Text>
                  <Box
                    as="pre"
                    p={4}
                    borderRadius="xl"
                    bg="#0f172a"
                    color="gray.100"
                    fontSize="0.7rem"
                    lineHeight="1.6"
                    overflowX="auto"
                  >
                    {JSON.stringify(data, null, 2)}
                  </Box>
                </Box>
              ) : section === undefined ? null : section.kind === "array" ? (
                (() => {
                  const key = section.keys[0];
                  const spec = fieldSpecOf(key);
                  if (spec === null || spec.kind !== "array") {
                    return (
                      <Text color="red.600">
                        {labelOf(key)} の定義をschemaから読み取れませんでした。
                      </Text>
                    );
                  }
                  const items = Array.isArray(data[key])
                    ? (data[key] as unknown[])
                    : [];
                  return (
                    <CollectionSection
                      collectionKey={key}
                      title={section.title}
                      description={section.description}
                      spec={spec}
                      items={items}
                      data={data}
                      idIndex={idIndex}
                      update={update}
                    />
                  );
                })()
              ) : (
                <Flex flexDirection="column" gap={5} maxW="1100px" mx="auto">
                  <Box
                    p={{ base: 4, md: 5 }}
                    borderRadius="2xl"
                    bg="white"
                    border="1px solid"
                    borderColor="gray.200"
                  >
                    <Heading size="md">{section.title}</Heading>
                    <Text
                      mt={2}
                      color="gray.600"
                      fontSize="xs"
                      lineHeight="1.7"
                    >
                      {section.description}
                    </Text>
                  </Box>
                  {section.id === "overview" ? (
                    <Box
                      p={{ base: 4, md: 5 }}
                      borderRadius="2xl"
                      bg="white"
                      border="1px solid"
                      borderColor="gray.200"
                    >
                      <ObjectFields
                        path={[]}
                        spec={{
                          ...schemaSpec,
                          fields: schemaSpec.fields.filter(field =>
                            section.keys.includes(field.key),
                          ),
                        }}
                        value={data}
                        depth={0}
                      />
                    </Box>
                  ) : (
                    (() => {
                      const key = section.keys[0];
                      const spec = fieldSpecOf(key);
                      if (spec === null || spec.kind !== "object") {
                        return (
                          <Text color="red.600">
                            {labelOf(key)}{" "}
                            の定義をschemaから読み取れませんでした。
                          </Text>
                        );
                      }
                      return (
                        <Box
                          p={{ base: 4, md: 5 }}
                          borderRadius="2xl"
                          bg="white"
                          border="1px solid"
                          borderColor="gray.200"
                        >
                          <ObjectFields
                            path={[key]}
                            spec={spec}
                            value={data[key]}
                            depth={0}
                          />
                        </Box>
                      );
                    })()
                  )}
                </Flex>
              )}
            </EditorProvider>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}
