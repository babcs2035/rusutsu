"use client";

import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LiftTicketCalculator } from "@/features/lift-ticket/components/LiftTicketCalculator";
import { LiftTicketPriceTable } from "@/features/lift-ticket/components/LiftTicketPriceTable";
import { RentalPriceTable } from "@/features/lift-ticket/components/RentalPriceTable";
import {
  type TicketCategory,
  ticketCategoriesOf,
} from "@/features/lift-ticket/utils/ticketCategories";
import { useScreenState } from "@/features/map/session/useScreenState";
import { cn } from "@/lib/utils";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import { useSimultaneousView } from "../components/SimultaneousToggle";
import type { Resort } from "../types";

const YukiMagiCard = ({ yukiMagi }: { yukiMagi: Resort["yukiMagi"] }) => {
  if (!yukiMagi) return null;
  const details = [
    { label: "特典", value: yukiMagi.benefit },
    { label: "適用期間", value: yukiMagi.period },
    { label: "除外日", value: yukiMagi.exclusionDate },
  ].filter(detail => detail.value);
  return (
    <section
      aria-label="雪マジ"
      className="rounded-xl border border-pink-200 bg-pink-50 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-pink-600 px-2.5 py-1 text-xs font-semibold text-white">
          雪マジ{yukiMagi.tag ? `・${yukiMagi.tag}` : ""}
        </span>
        <h2 className="text-base font-bold text-pink-900">{yukiMagi.name}</h2>
      </div>
      {details.length > 0 && (
        <dl className="mt-3 space-y-1.5 text-sm">
          {details.map(detail => (
            <div key={detail.label} className="flex gap-2">
              <dt className="w-16 shrink-0 font-semibold text-pink-800">
                {detail.label}
              </dt>
              <dd className="min-w-0 text-pink-900">{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {yukiMagi.url && (
        <ExternalLinkComponent
          href={yukiMagi.url}
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-pink-700 hover:bg-pink-100"
        >
          詳しく見る
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </ExternalLinkComponent>
      )}
    </section>
  );
};

/** 「高鷲のみ」「ダイナランド共通券」「TAKASU MOUNTAINS TICKET」の切り替え */
const TicketCategoryTabs = ({
  categories,
  activeKey,
  onChange,
}: {
  categories: TicketCategory[];
  activeKey: string;
  onChange: (key: string) => void;
}) => (
  <div role="tablist" aria-label="券の種類" className="flex flex-wrap gap-2">
    {categories.map(category => {
      const isActive = category.key === activeKey;
      return (
        <Button
          key={category.key}
          type="button"
          role="tab"
          aria-selected={isActive}
          size="xs"
          variant={isActive ? "default" : "outline"}
          className={cn("h-8 rounded-full px-3", !isActive && "text-gray-700")}
          onClick={() => onChange(category.key)}
        >
          {category.label}
        </Button>
      );
    })}
  </div>
);

export const TicketsTab = ({ resort }: { resort: Resort }) => {
  const tickets = resort.tickets;
  // 「〇〇も同時に表示」中は、組のスキー場の券も選べるようにする
  const { active, partners } = useSimultaneousView(resort);
  const members = useMemo(() => [resort, ...partners], [resort, partners]);
  const categories = useMemo(
    () =>
      ticketCategoriesOf(
        members.map(member => ({
          resortId: member.id,
          nameJa: member.nameJa,
          shortName: member.shortName,
          label: active?.memberLabels[member.id],
          seasons: member.liftTickets,
        })),
      ),
    [active, members],
  );
  const [selectedKey, setSelectedKey] = useScreenState(
    `rusutsu:detail:v1:${resort.id}:ticketCategory`,
    z.string(),
    "",
  );
  const category =
    categories.find(item => item.key === selectedKey) ?? categories[0] ?? null;
  const liftTicketData = category?.seasons[0] ?? null;
  // 固有の券しかなければ切り替えは出さない。共通券しかないときは、
  // 共通券であることが分かるようにその1つを出す。
  const showCategories =
    categories.length > 1 || (category !== null && category.kind !== "own");
  const categoryControl = showCategories ? (
    <TicketCategoryTabs
      categories={categories}
      activeKey={category?.key ?? ""}
      onChange={setSelectedKey}
    />
  ) : undefined;
  const yukiMagi =
    members.find(member => member.id === category?.resortId)?.yukiMagi ??
    resort.yukiMagi;

  if (category && liftTicketData) {
    return (
      <div className="flex flex-col gap-6">
        <YukiMagiCard yukiMagi={yukiMagi} />
        <LiftTicketCalculator
          key={category.key}
          seasons={category.seasons}
          sessionKey={`rusutsu:detail:v1:${resort.id}:ticketInput`}
          categoryControl={categoryControl}
        />
        <section>
          <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
            公式リフト料金表
          </h2>
          <p className="mt-2 mb-4 text-gray-600 text-sm">
            {showCategories && `${category.label}・`}
            {liftTicketData.season.label_ja}
            の券種・対象・適用日を表示しています。
          </p>
          <LiftTicketPriceTable
            data={liftTicketData}
            scope={category.kind === "own" ? "single" : "shared"}
          />
        </section>
        {(liftTicketData.rentals?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
              公式レンタル料金表
            </h2>
            <p className="mt-2 mb-4 text-gray-600 text-sm">
              用具・対象・期間ごとの料金を表示しています。
            </p>
            <RentalPriceTable data={liftTicketData} />
          </section>
        )}
        {(liftTicketData.data_quality.unresolved_questions?.length ?? 0) >
          0 && (
          <Alert className="bg-orange-50 border-orange-300">
            <AlertTitle className="text-orange-900 text-sm font-semibold">
              公式資料だけでは確定できない条件があります
            </AlertTitle>
            <AlertDescription className="mt-1 text-orange-900">
              <div className="flex flex-col gap-1.5">
                {liftTicketData.data_quality.unresolved_questions
                  ?.slice(0, 5)
                  .map(question => (
                    <p
                      key={question.id}
                      className="text-orange-900 text-xs leading-relaxed"
                    >
                      ・{question.question_ja}
                    </p>
                  ))}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <YukiMagiCard yukiMagi={resort.yukiMagi} />
      <section>
        <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
          リフト券
        </h2>
        <Card className="mt-4 overflow-x-auto py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="table-header-cell">券種</TableHead>
                  <TableHead className="table-header-cell">大人</TableHead>
                  <TableHead className="table-header-cell">子供</TableHead>
                  <TableHead className="table-header-cell">シニア</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="px-4 py-8 text-center text-sm font-semibold text-gray-500"
                    >
                      リフト券データがありません
                    </TableCell>
                  </TableRow>
                )}
                {tickets.map(t => (
                  <TableRow
                    key={t.id}
                    className="border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <TableCell className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                      {t.name}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-700 font-mono font-semibold whitespace-nowrap">
                      {t.priceAdult ? `¥${t.priceAdult.toLocaleString()}` : "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-700 font-mono font-semibold whitespace-nowrap">
                      {t.priceChild ? `¥${t.priceChild.toLocaleString()}` : "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-700 font-mono font-semibold whitespace-nowrap">
                      {t.priceSenior
                        ? `¥${t.priceSenior.toLocaleString()}`
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
