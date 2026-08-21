"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLinkComponent } from "@/shared/components/ExternalLink";
import type { Resort } from "../types";

export const OverviewTab = ({ resort }: { resort: Resort }) => (
  <div className="flex flex-col gap-6">
    {resort.yukiMagi && (
      <section>
        <Card className="rounded-2xl border border-pink-200 bg-pink-50">
          <CardHeader>
            <CardTitle className="text-base text-pink-600 font-semibold">
              雪マジ！情報
            </CardTitle>
            {resort.yukiMagi.tag && (
              <Badge
                variant="secondary"
                className="rounded-full bg-pink-100 text-pink-700 text-xs font-medium"
              >
                {resort.yukiMagi.tag}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {resort.yukiMagi.benefit && (
                <div>
                  <p className="font-semibold text-xs text-pink-700">
                    特典内容
                  </p>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                    {resort.yukiMagi.benefit}
                  </p>
                </div>
              )}
              {resort.yukiMagi.period && (
                <div>
                  <p className="font-semibold text-xs text-pink-700">
                    利用期間
                  </p>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                    {resort.yukiMagi.period}
                  </p>
                </div>
              )}
              {resort.yukiMagi.exclusionDate && (
                <div>
                  <p className="font-semibold text-xs text-pink-700">除外日</p>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                    {resort.yukiMagi.exclusionDate}
                  </p>
                </div>
              )}
              {resort.yukiMagi.url && (
                <ExternalLinkComponent
                  href={resort.yukiMagi.url}
                  className="text-xs text-blue-600 underline hover:text-blue-700 mt-2"
                >
                  公式サイトで詳細を見る
                </ExternalLinkComponent>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    )}
    <section>
      <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
        概要
      </h2>
      <p className="mt-4 whitespace-pre-wrap text-gray-700 leading-relaxed text-base">
        {resort.descriptionLong}
      </p>
    </section>
    <section>
      <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
        営業時間
      </h2>
      <Card className="mt-4 w-full overflow-x-auto py-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="table-header-cell">区分</TableHead>
                <TableHead className="table-header-cell">時間</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="border-gray-200">
                <TableCell className="px-4 py-3 font-semibold text-gray-700">
                  平日
                </TableCell>
                <TableCell className="px-4 py-3 text-gray-600">
                  {resort.weekdayOpen} - {resort.weekdayClose}
                </TableCell>
              </TableRow>
              <TableRow className="border-gray-200">
                <TableCell className="px-4 py-3 font-semibold text-gray-700">
                  土日祝
                </TableCell>
                <TableCell className="px-4 py-3 text-gray-600">
                  {resort.weekendOpen} - {resort.weekendClose}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {resort.timesComment && (
        <p className="mt-3 text-sm text-gray-500 italic">
          * {resort.timesComment}
        </p>
      )}
    </section>

    <section>
      <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
        リンク
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {resort.website && (
          <li>
            <ExternalLinkComponent
              href={resort.website}
              className="text-blue-600 flex items-center gap-2 hover:text-blue-700 hover:underline transition-all duration-200"
            >
              <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />{" "}
              公式サイト
            </ExternalLinkComponent>
          </li>
        )}
        {resort.sources.map((src: string) => {
          const hostname = (() => {
            try {
              return new URL(src).hostname;
            } catch {
              return src;
            }
          })();
          return (
            <li key={src}>
              <ExternalLinkComponent
                href={src}
                className="text-gray-600 flex items-center gap-2 hover:text-blue-700 hover:underline transition-all duration-200"
              >
                <span className="h-2 w-2 rounded-full bg-gray-400 flex-shrink-0" />{" "}
                {hostname}
              </ExternalLinkComponent>
            </li>
          );
        })}
      </ul>
    </section>
  </div>
);
