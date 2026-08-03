"use client";

import { Box, Flex, Heading } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import type { LiftTicketData, LiftTicketSearchInput } from "../types";
import {
  calculateLiftTicketPlan,
  DEFAULT_LIFT_TICKET_SEARCH_INPUT,
  selectLiftTicketSeason,
} from "../utils/calculateLiftTicket";
import { TicketPartyEditor } from "./TicketPartyEditor";
import { TicketPlanCard } from "./TicketPlanCard";

export const LiftTicketCalculator = ({
  seasons,
  initialInput = DEFAULT_LIFT_TICKET_SEARCH_INPUT,
}: {
  seasons: LiftTicketData[];
  initialInput?: LiftTicketSearchInput;
}) => {
  const [input, setInput] = useState<LiftTicketSearchInput>(initialInput);
  const data =
    selectLiftTicketSeason(seasons, input.visitDate) ?? seasons[0] ?? null;

  // 日ごとの計画から合計を出す。2日以上なら「連続2日券」と「1日券×2」を比べる
  const plan = useMemo(
    () => (data ? calculateLiftTicketPlan(data, input) : null),
    [data, input],
  );

  const durationHint = useMemo(() => {
    if (!data || !plan || plan.days.length === 0) return null;
    const parts = plan.days.map((day, index) => {
      const label =
        day.plan.duration.kind === "hours"
          ? `${day.plan.duration.hours}時間`
          : day.plan.duration.withNight
            ? "1日（ナイター込）"
            : "1日（ナイター無）";
      const head =
        plan.days.length === 1 ? label : `${index + 1}日目: ${label}`;
      // ★理由を取り違えないこと。日付や人数が未入力なだけなのに
      // 「該当する券がありません」と出すと、データが無いように読める
      if (day.result.status === "unavailable") {
        return `${head} → ${day.result.notes[0] ?? "計算できません"}`;
      }
      if (day.result.status === "closed") {
        return `${head} → 営業していません`;
      }
      if (day.result.status === "outside_season") {
        return `${head} → シーズン対象期間外`;
      }
      return `${head} → ${day.result.productName ?? "該当する券がありません"}`;
    });
    if (plan.multiDay) {
      parts.push(
        `${plan.multiDay.productName}を使うと合計 ¥${plan.multiDay.total.toLocaleString("ja-JP")}（1日ずつなら ¥${plan.multiDay.perDayTotal.toLocaleString("ja-JP")}）`,
      );
    }
    return parts.join(" / ");
  }, [data, plan]);

  return (
    <Box
      as="section"
      p={{ base: 4, md: 5 }}
      borderRadius="2xl"
      bg="gray.50"
      border="1px solid"
      borderColor="gray.200"
    >
      <Heading size="md" color="gray.900" fontFamily="var(--font-heading)">
        日付・人数から料金を計算
      </Heading>
      <Flex mt={4} flexDirection="column" gap={4}>
        <TicketPartyEditor
          value={input}
          onChange={setInput}
          durationHint={durationHint}
        />
        {plan && <TicketPlanCard plan={plan} />}
      </Flex>
    </Box>
  );
};
