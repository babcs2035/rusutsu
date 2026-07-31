"use client";

import { Box, Button, Flex, Table, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import type { LiftTicketData } from "../types";
import { formatLiftTicketPrice } from "../utils/calculateLiftTicket";

type TableMode = "daily" | "other";

export const LiftTicketPriceTable = ({ data }: { data: LiftTicketData }) => {
  const [mode, setMode] = useState<TableMode>("daily");
  const productById = useMemo(
    () => new Map(data.products.map(product => [product.id, product])),
    [data.products],
  );
  const audienceById = useMemo(
    () => new Map(data.audiences.map(audience => [audience.id, audience])),
    [data.audiences],
  );
  const calendarById = useMemo(
    () => new Map(data.calendars.map(calendar => [calendar.id, calendar])),
    [data.calendars],
  );
  const channelById = useMemo(
    () => new Map(data.channels.map(channel => [channel.id, channel])),
    [data.channels],
  );
  const offers = data.offers.filter(offer => {
    const product = productById.get(offer.product_id);
    const isDaily =
      product?.product_type !== "shared_pass" &&
      product?.product_type !== "package";
    return mode === "daily" ? isDaily : !isDaily;
  });

  return (
    <Flex flexDirection="column" gap={3}>
      <Flex gap={2} flexWrap="wrap">
        {[
          ["daily", "当日券・回数券"],
          ["other", "セット券・共通券"],
        ].map(([value, label]) => {
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
              onClick={() => setMode(value as TableMode)}
            >
              {label}
            </Button>
          );
        })}
      </Flex>
      <Box
        w="100%"
        overflowX="auto"
        borderRadius="xl"
        border="1px solid"
        borderColor="gray.200"
        bg="white"
      >
        <Table.Root size="sm" minW="720px">
          <Table.Header>
            <Table.Row bg="gray.100">
              {["券種", "対象", "利用日", "料金", "購入方法"].map(label => (
                <Table.ColumnHeader
                  key={label}
                  px={4}
                  py={3}
                  color="gray.600"
                  fontSize="xs"
                  fontWeight="800"
                  whiteSpace="nowrap"
                >
                  {label}
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {offers.map(offer => {
              const product = productById.get(offer.product_id);
              const audiences = (offer.audience_ids ?? [])
                .map(id => audienceById.get(id)?.official_label_ja)
                .filter((label): label is string => Boolean(label));
              const calendars = (offer.calendar_ids ?? [])
                .map(id => calendarById.get(id)?.name_ja)
                .filter((label): label is string => Boolean(label));
              const channels = (offer.channel_ids ?? [])
                .map(id => channelById.get(id)?.name_ja)
                .filter((label): label is string => Boolean(label));
              return (
                <Table.Row key={offer.id} borderColor="gray.200">
                  <Table.Cell px={4} py={3} minW="180px">
                    <Text color="gray.900" fontWeight="800">
                      {product?.name_ja ?? offer.name_ja}
                    </Text>
                    {offer.offer_type === "discounted" && (
                      <Text mt={0.5} color="orange.700" fontSize="0.68rem">
                        {offer.name_ja}
                      </Text>
                    )}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="gray.700">
                    {audiences.join("、") || "区分なし"}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="gray.700">
                    {calendars.join("、") || "期間内"}
                  </Table.Cell>
                  <Table.Cell
                    px={4}
                    py={3}
                    color="gray.900"
                    fontFamily="mono"
                    fontWeight="900"
                    whiteSpace="nowrap"
                  >
                    {formatLiftTicketPrice(offer.price)}
                  </Table.Cell>
                  <Table.Cell px={4} py={3} color="gray.700">
                    {channels.join("、") || "要確認"}
                  </Table.Cell>
                </Table.Row>
              );
            })}
            {offers.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={5} px={4} py={8} textAlign="center">
                  <Text color="gray.500" fontSize="sm">
                    この区分の料金はありません。
                  </Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Root>
      </Box>
      <Text color="gray.500" fontSize="xs" lineHeight="1.6">
        {data.season.label_ja}
        {data.calculation_policy?.tax_included === true
          ? "・税込"
          : "・税込表記は公式確認が必要"}
        {data.data_quality.status !== "complete"
          ? `・データ品質 ${data.data_quality.status}`
          : ""}
      </Text>
    </Flex>
  );
};
