"use client";

import { Box, Button, Flex, Table, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import type { LiftTicketData } from "../types";
import { sharedResortsOf } from "../types";
import type {
  PriceCell,
  PriceReference,
  PriceTable,
} from "../utils/priceTable";
import { buildLiftTicketPriceTables } from "../utils/priceTable";
import { SourceList, SourceMarks } from "./SourceMarks";

/** 単独券（このスキー場だけ）か共通券（他のスキー場でも使える）か */
type TableMode = "single" | "shared";

/**
 * 公式サイトの料金表と同じ見え方（縦=券種、横=人物区分）で出す。
 * 行や列の決め方は `buildLiftTicketPriceTables` が data だけから導くので、
 * スキー場ごとの特別扱いはここにも実装側にも無い。
 */
/**
 * 1セル。日付によって料金が変わる券は「平日：6,300円 / 土日：6,800円」と
 * 同じセルに並べる（公式サイトの料金表と同じ見え方）。
 */
const PriceCellBody = ({
  cell,
  references,
}: {
  cell: PriceCell | undefined;
  references: PriceReference[];
}) => {
  if (!cell || cell.entries.length === 0) {
    return (
      <Text color="gray.300" fontSize="sm">
        —
      </Text>
    );
  }
  return (
    <Flex flexDirection="column" alignItems="flex-end" gap={0.5}>
      {cell.entries.map(entry => (
        <Text
          key={entry.offerId}
          color="gray.900"
          fontSize={entry.amount == null ? "xs" : "sm"}
          fontWeight={entry.amount == null ? "500" : "900"}
          fontFamily={entry.amount == null ? undefined : "mono"}
          whiteSpace="nowrap"
        >
          {entry.calendarLabel && (
            <Text
              as="span"
              mr={1}
              color="gray.600"
              fontSize="0.7rem"
              fontWeight="600"
              fontFamily="body"
            >
              {entry.calendarLabel}：
            </Text>
          )}
          {entry.text}
          <SourceMarks numbers={entry.sourceNumbers} references={references} />
        </Text>
      ))}
    </Flex>
  );
};

const PriceGrid = ({
  table,
  references,
}: {
  table: PriceTable;
  references: PriceReference[];
}) => (
  <Box
    w="100%"
    overflowX="auto"
    borderRadius="xl"
    border="1px solid"
    borderColor="gray.200"
    bg="white"
  >
    <Table.Root size="sm" minW={`${260 + table.audiences.length * 140}px`}>
      <Table.Header>
        <Table.Row bg="gray.100">
          <Table.ColumnHeader
            px={4}
            py={3}
            color="gray.600"
            fontSize="xs"
            fontWeight="800"
            whiteSpace="nowrap"
          >
            券種
          </Table.ColumnHeader>
          {table.audiences.map(audience => (
            <Table.ColumnHeader
              key={audience.id}
              px={4}
              py={3}
              color="gray.600"
              fontSize="xs"
              fontWeight="800"
              textAlign="right"
            >
              {audience.label}
            </Table.ColumnHeader>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {table.rows.map(row => (
          <Table.Row key={row.key} borderColor="gray.200">
            <Table.Cell px={4} py={3} minW="240px" verticalAlign="top">
              <Text color="gray.900" fontWeight="800">
                {row.label}
              </Text>
              {row.subLabel && (
                <Text mt={0.5} color="gray.600" fontSize="0.7rem">
                  {row.subLabel}
                </Text>
              )}
              {row.conditions.map(condition => (
                <Text
                  key={condition}
                  mt={0.5}
                  color="gray.600"
                  fontSize="0.68rem"
                  lineHeight="1.5"
                >
                  {condition}
                </Text>
              ))}
              {row.notes.length > 0 && (
                <Text
                  mt={0.5}
                  color="gray.500"
                  fontSize="0.68rem"
                  lineHeight="1.5"
                >
                  {row.notes.join(" / ")}
                </Text>
              )}
            </Table.Cell>
            {/* 全区分で同額なら1つのセルに結合する（回数券は大人・子供同額） */}
            {row.spansAllAudiences ? (
              <Table.Cell
                px={4}
                py={3}
                textAlign="center"
                colSpan={table.audiences.length}
                verticalAlign="top"
              >
                <Flex justifyContent="center">
                  <PriceCellBody
                    cell={row.cells.get(table.audiences[0].id)}
                    references={references}
                  />
                </Flex>
              </Table.Cell>
            ) : (
              table.audiences.map(audience => (
                <Table.Cell
                  key={audience.id}
                  px={4}
                  py={3}
                  textAlign="right"
                  verticalAlign="top"
                >
                  <PriceCellBody
                    cell={row.cells.get(audience.id)}
                    references={references}
                  />
                </Table.Cell>
              ))
            )}
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  </Box>
);

export const LiftTicketPriceTable = ({ data }: { data: LiftTicketData }) => {
  const [mode, setMode] = useState<TableMode>("single");
  const sharedPartners = useMemo(
    () => sharedResortsOf(data.products),
    [data.products],
  );
  const tables = useMemo(
    () => buildLiftTicketPriceTables(data, { scope: mode }),
    [data, mode],
  );

  const modes: Array<[TableMode, string]> = [
    ["single", "このスキー場のみ"],
    [
      "shared",
      sharedPartners.length > 0
        ? `共通券（${sharedPartners.map(partner => partner.nameJa).join("・")}）`
        : "共通券",
    ],
  ];

  const sections = [
    { key: "base", title: "基本料金", table: tables.base },
    { key: "discount", title: "割引・条件付き料金", table: tables.discount },
  ].filter(section => section.table.rows.length > 0);

  return (
    <Flex flexDirection="column" gap={4}>
      {sharedPartners.length > 0 && (
        <Flex gap={2} flexWrap="wrap">
          {modes.map(([value, label]) => {
            const isActive = mode === value;
            return (
              <Button
                key={value}
                type="button"
                size="xs"
                h={8}
                px={3}
                borderRadius="full"
                bg={isActive ? "brand.600" : "white"}
                color={isActive ? "white" : "gray.700"}
                border="1px solid"
                borderColor={isActive ? "brand.600" : "gray.300"}
                onClick={() => setMode(value)}
              >
                {label}
              </Button>
            );
          })}
        </Flex>
      )}

      {/* 基本料金と条件付き料金を分ける。同じ表に並べると
          「誰でもその値段で買える」と誤読される */}
      {sections.map(section => (
        <Flex key={section.key} flexDirection="column" gap={2}>
          <Text color="gray.900" fontSize="sm" fontWeight="900">
            {section.title}
          </Text>
          {section.key === "discount" && (
            <Text color="gray.500" fontSize="xs" lineHeight="1.6">
              対象者・購入方法・期限の条件があります。行の下の注記を確認してください。
            </Text>
          )}
          <PriceGrid table={section.table} references={tables.references} />
        </Flex>
      ))}

      {sections.length === 0 && (
        <Box
          w="100%"
          py={8}
          borderRadius="xl"
          border="1px solid"
          borderColor="gray.200"
          bg="white"
          textAlign="center"
        >
          <Text color="gray.500" fontSize="sm">
            この区分の料金はありません。
          </Text>
        </Box>
      )}

      {data.fees.length > 0 && (
        <Text color="gray.500" fontSize="xs" lineHeight="1.6">
          別途:{" "}
          {data.fees
            .filter(fee => fee.amount != null)
            .map(
              fee =>
                `${fee.official_label_ja ?? fee.name_ja} ¥${(fee.amount ?? 0).toLocaleString("ja-JP")}`,
            )
            .join(" / ")}
        </Text>
      )}

      <SourceList references={tables.references} />

      <Text color="gray.500" fontSize="xs" lineHeight="1.6">
        {data.season.label_ja}
        {data.calculation_policy?.tax_included === true
          ? "・税込"
          : "・税込表記は公式確認が必要"}
      </Text>
    </Flex>
  );
};
