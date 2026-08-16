"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Resort } from "./types";

export const CompareOverviewTab = ({ resorts }: { resorts: Resort[] }) => (
  <Card className="overflow-x-auto py-0">
    <CardContent className="p-0">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="table-header-cell">スキー場</TableHead>
            <TableHead className="table-header-cell">コース数</TableHead>
            <TableHead className="table-header-cell">リフト数</TableHead>
            <TableHead className="table-header-cell">最高標高</TableHead>
            <TableHead className="table-header-cell">最低標高</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resorts.map(resort => (
            <TableRow key={resort.id} className="border-b border-gray-200">
              <TableCell className="min-w-[220px] px-6 py-4">
                <p className="font-semibold text-gray-900 font-[var(--font-heading)]">
                  {resort.nameJa}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  {resort.prefecture} · {resort.town}
                </p>
              </TableCell>
              <OverviewTableValue value={`${resort.numberOfCourses}`} />
              <OverviewTableValue value={`${resort.numberOfLifts}`} />
              <OverviewTableValue
                value={`${resort.topElevation.toLocaleString()} m`}
              />
              <OverviewTableValue
                value={`${resort.baseElevation.toLocaleString()} m`}
              />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

const OverviewTableValue = ({ value }: { value: string }) => (
  // §6: 数値は font-mono（列の桁揃えのため）。スキー場名セルのみ見出しフォント
  <TableCell className="whitespace-nowrap font-bold text-gray-900 font-mono">
    {value}
  </TableCell>
);
