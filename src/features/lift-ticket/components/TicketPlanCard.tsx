"use client";

import { Box, Flex, Text } from "@chakra-ui/react";
import type { TicketPlanResult } from "../utils/calculateLiftTicket";
import { SourceList, SourceMarks } from "./SourceMarks";

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

const durationLabelOf = (
  duration: TicketPlanResult["days"][number]["plan"]["duration"],
) =>
  duration.kind === "hours"
    ? `${duration.hours}時間`
    : duration.withNight
      ? "1日（ナイター込）"
      : "1日（ナイター無）";

const weekdayOf = (date: string) => {
  if (!date) return "";
  const at = new Date(`${date}T12:00:00Z`);
  return ["日", "月", "火", "水", "木", "金", "土"][at.getUTCDay()];
};

/**
 * 日ごとの料金と合計を出す。
 *
 * ★**2日以上滑る場合は「連続2日券」と「1日券×2」を比べて安いほうを出す。**
 * どちらを採用したかが分かるように、採用しなかった側の金額も併記する。
 */
export const TicketPlanCard = ({ plan }: { plan: TicketPlanResult }) => {
  const usesMultiDay = plan.multiDay != null;

  // 全日が同じ理由で計算できない場合（日付・人数の未入力など）は、
  // 未確定の行を並べるより理由を1つ出したほうが分かりやすい
  const blockingNote =
    plan.days.length > 0 &&
    plan.days.every(
      day =>
        day.result.status === "unavailable" &&
        day.result.notes[0] === plan.days[0].result.notes[0],
    )
      ? plan.days[0].result.notes[0]
      : null;

  if (plan.days.length === 0 || blockingNote) {
    return (
      <Box
        p={4}
        borderRadius="xl"
        bg="gray.50"
        border="1px solid"
        borderColor="gray.200"
      >
        <Text color="gray.600" fontSize="sm" fontWeight="800">
          {blockingNote ?? "日付と1人以上の人数を入力してください。"}
        </Text>
      </Box>
    );
  }

  return (
    <Flex flexDirection="column" gap={3}>
      <Box
        p={4}
        borderRadius="xl"
        bg={plan.total == null ? "gray.50" : "orange.50"}
        border="1px solid"
        borderColor={plan.total == null ? "gray.200" : "orange.200"}
      >
        <Flex alignItems="baseline" justifyContent="space-between" gap={3}>
          <Text color="gray.700" fontSize="xs" fontWeight="800">
            {plan.days.length === 1 ? "合計" : `${plan.days.length}日の合計額`}
          </Text>
          {plan.total == null ? (
            <Text color="gray.600" fontSize="sm" fontWeight="800">
              未確定
            </Text>
          ) : (
            <Text
              color="gray.900"
              fontFamily="mono"
              fontSize="2xl"
              fontWeight="900"
            >
              {yen(plan.total)}
            </Text>
          )}
        </Flex>

        {plan.multiDay && (
          <Text mt={1.5} color="orange.800" fontSize="xs" lineHeight="1.6">
            {plan.multiDay.productName}（{plan.multiDay.days}
            日券）を使うほうが安いです。 1日ずつ買うと{" "}
            {yen(plan.multiDay.perDayTotal)}。
          </Text>
        )}

        <Flex mt={3} flexDirection="column" gap={2}>
          {plan.days.map((day, index) => {
            const covered =
              usesMultiDay && plan.multiDay?.dates.includes(day.plan.date);
            return (
              <Box
                key={day.plan.id}
                pb={2}
                borderBottom="1px solid"
                borderColor="blackAlpha.100"
              >
                <Flex
                  alignItems="flex-start"
                  justifyContent="space-between"
                  gap={3}
                >
                  <Box minW={0}>
                    <Text color="gray.800" fontSize="sm" fontWeight="800">
                      {index + 1}日目
                      {day.plan.date && (
                        <Text
                          as="span"
                          ml={1.5}
                          color="gray.600"
                          fontWeight="600"
                        >
                          {day.plan.date}（{weekdayOf(day.plan.date)}）
                        </Text>
                      )}
                    </Text>
                    <Text mt={0.5} color="gray.600" fontSize="xs">
                      {durationLabelOf(day.plan.duration)}
                      {day.result.productName
                        ? ` → ${day.result.productName}`
                        : ""}
                    </Text>
                    {day.result.status === "closed" && (
                      <Text mt={0.5} color="orange.800" fontSize="xs">
                        この日は営業していません
                        {day.result.notes[0]
                          ? `（${day.result.notes[0]}）`
                          : ""}
                      </Text>
                    )}
                    {day.result.status === "outside_season" && (
                      <Text mt={0.5} color="orange.800" fontSize="xs">
                        {day.result.notes[0]}
                      </Text>
                    )}
                  </Box>
                  <Text
                    flexShrink={0}
                    color={covered ? "gray.500" : "gray.900"}
                    fontFamily="mono"
                    fontSize="sm"
                    fontWeight="900"
                    textDecoration={covered ? "line-through" : undefined}
                  >
                    {day.result.payableTotal == null
                      ? "未確定"
                      : yen(day.result.payableTotal)}
                    <SourceMarks
                      numbers={day.result.lines.flatMap(
                        line => line.sourceNumbers,
                      )}
                      references={plan.references}
                    />
                  </Text>
                </Flex>

                {/* 誰がいくらか。日ごとに区分が変わることはないが、
                    どの券が当たったかは日によって変わる */}
                {day.result.lines.length > 0 && (
                  <Flex mt={1} flexDirection="column" gap={0.5}>
                    {day.result.lines.map(line => (
                      <Flex
                        key={line.groupId}
                        justifyContent="space-between"
                        gap={2}
                      >
                        <Text color="gray.600" fontSize="0.68rem">
                          {line.groupLabel} × {line.count}
                          {line.offerName ? `　${line.offerName}` : ""}
                          {line.note ? `　${line.note}` : ""}
                        </Text>
                        <Text
                          flexShrink={0}
                          color="gray.700"
                          fontFamily="mono"
                          fontSize="0.68rem"
                        >
                          {line.subtotal == null
                            ? "未確定"
                            : yen(line.subtotal)}
                        </Text>
                      </Flex>
                    ))}
                    {day.result.lines.flatMap(line =>
                      (line.warnings ?? []).map(warning => (
                        <Text
                          key={`${line.groupId}:${warning}`}
                          color="orange.800"
                          fontSize="0.68rem"
                          lineHeight="1.5"
                        >
                          ※ {warning}
                        </Text>
                      )),
                    )}
                    {day.result.lines.some(
                      line => line.standardSubtotal != null,
                    ) && (
                      <Text color="gray.500" fontSize="0.68rem">
                        通常料金:{" "}
                        {day.result.lines
                          .filter(line => line.standardSubtotal != null)
                          .map(
                            line =>
                              `${line.groupLabel} ${yen(line.standardSubtotal ?? 0)}`,
                          )
                          .join("、")}
                      </Text>
                    )}
                  </Flex>
                )}

                {day.result.conditionalOffers.length > 0 && (
                  <Box
                    mt={2}
                    p={2.5}
                    borderRadius="lg"
                    bg="purple.50"
                    border="1px solid"
                    borderColor="purple.200"
                  >
                    <Text color="purple.900" fontSize="0.7rem" fontWeight="900">
                      条件を満たす場合の割引料金
                    </Text>
                    <Flex mt={1.5} flexDirection="column" gap={1.5}>
                      {day.result.conditionalOffers.map(offer => (
                        <Flex
                          key={offer.id}
                          alignItems="flex-start"
                          justifyContent="space-between"
                          gap={2}
                        >
                          <Box minW={0}>
                            <Text
                              color="purple.900"
                              fontSize="0.68rem"
                              fontWeight="800"
                            >
                              {offer.offerName}（{offer.groupLabel} ×{" "}
                              {offer.count}）
                            </Text>
                            <Text
                              mt={0.5}
                              color="purple.800"
                              fontSize="0.64rem"
                              lineHeight="1.5"
                            >
                              {offer.conditions.length > 0
                                ? offer.conditions.join(" / ")
                                : "公式の適用条件を確認してください。"}
                            </Text>
                          </Box>
                          <Text
                            flexShrink={0}
                            color="purple.900"
                            fontFamily="mono"
                            fontSize="0.68rem"
                            fontWeight="900"
                          >
                            {yen(offer.subtotal)}
                            <SourceMarks
                              numbers={offer.sourceNumbers}
                              references={plan.references}
                            />
                          </Text>
                        </Flex>
                      ))}
                    </Flex>
                  </Box>
                )}
              </Box>
            );
          })}
        </Flex>

        {usesMultiDay && plan.multiDay && (
          <Flex mt={2} justifyContent="space-between" gap={3}>
            <Text color="orange.900" fontSize="sm" fontWeight="800">
              {plan.multiDay.productName}（
              {plan.multiDay.dates.map(date => date.slice(5)).join("・")}）
            </Text>
            <Text
              color="orange.900"
              fontFamily="mono"
              fontSize="sm"
              fontWeight="900"
            >
              {yen(plan.multiDay.total)}
            </Text>
          </Flex>
        )}
      </Box>

      {plan.references.length > 0 && (
        <SourceList references={plan.references} />
      )}
    </Flex>
  );
};
