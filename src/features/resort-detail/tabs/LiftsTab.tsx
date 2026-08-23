"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SelectedMapFeature } from "@/features/map/types";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";
import { StatCard } from "../components/StatCard";
import type { Resort } from "../types";
import {
  formatLiftStatus,
  formatMeters,
  getLiftElevationDiff,
  maxNullable,
} from "../utils/detailMetrics";

export const LiftsTab = ({
  resort,
  finalizedMapData,
  selectedFinalizedFeature,
  onSelectedFinalizedFeatureChange,
}: {
  resort: Resort;
  finalizedMapData: FinalizedResortMapData | null;
  selectedFinalizedFeature: SelectedMapFeature | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
}) => {
  const finalizedLifts = finalizedMapData?.lifts?.features ?? [];
  const lifts = resort.lifts;
  const [typeFilter, setTypeFilter] = useState("全て");

  const typeOptions = useMemo(
    () => [
      "全て",
      ...Array.from(
        new Set(lifts.map(l => l.type).filter(Boolean) as string[]),
      ),
    ],
    [lifts],
  );

  const processedLifts = useMemo(() => {
    if (typeFilter === "全て") return lifts;
    return lifts.filter(l => l.type === typeFilter);
  }, [lifts, typeFilter]);

  if (finalizedLifts.length > 0) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StatCard title="全リフト数" value={`${finalizedLifts.length}`} />
          <StatCard
            title="最長距離"
            value={formatMeters(
              maxNullable(
                finalizedLifts.map(
                  lift =>
                    lift.properties.slopeDistMap ?? lift.properties.distance,
                ),
              ),
            )}
          />
          <StatCard
            title="最大高低差"
            value={formatMeters(
              maxNullable(
                finalizedLifts.map(lift => getLiftElevationDiff(lift)),
              ),
            )}
          />
          <StatCard
            title="データ"
            value={finalizedMapData?.lifts?.fileName ?? "--"}
          />
        </div>

        <section>
          <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
            リフト一覧
          </h2>
          <Card className="mt-4 w-full overflow-x-auto py-0">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="table-header-cell">名称</TableHead>
                    <TableHead className="table-header-cell">タイプ</TableHead>
                    <TableHead className="table-header-cell">速度</TableHead>
                    <TableHead className="table-header-cell">距離</TableHead>
                    <TableHead className="table-header-cell">状況</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finalizedLifts.map(lift => {
                    const isSelected =
                      selectedFinalizedFeature?.kind === "lift" &&
                      selectedFinalizedFeature.id === lift.id;
                    return (
                      <TableRow
                        key={lift.id}
                        className={cn(
                          "cursor-pointer",
                          isSelected
                            ? "bg-blue-50 hover:bg-blue-100 hover:text-blue-700"
                            : "bg-white hover:bg-gray-50 hover:text-gray-900",
                          "border-b border-gray-200",
                        )}
                        onClick={() =>
                          onSelectedFinalizedFeatureChange({
                            kind: "lift",
                            id: lift.id,
                          })
                        }
                      >
                        <TableCell className="px-4 py-3 font-semibold whitespace-nowrap">
                          {lift.name}
                        </TableCell>
                        <TableCell className="px-4 py-3 whitespace-nowrap">
                          {lift.properties.type ?? "--"}
                        </TableCell>
                        <TableCell className="px-4 py-3 whitespace-nowrap">
                          {lift.properties.speed ?? "--"}
                        </TableCell>
                        <TableCell className="px-4 py-3 whitespace-nowrap">
                          {formatMeters(
                            lift.properties.slopeDistMap ??
                              lift.properties.distance,
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 whitespace-nowrap">
                          {formatLiftStatus(lift.properties.status)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="grid grid-cols-2 gap-4">
          <StatCard title="全リフト数" value={`${resort.numberOfLifts}`} />
          <StatCard
            title="ゴンドラ・ロープウェイ"
            value={`${resort.gondolas}`}
          />
          <StatCard title="クワッドリフト" value={`${resort.quadLifts}`} />
          <StatCard title="ペアリフト" value={`${resort.pairLifts}`} />
        </div>
      </section>
      <section>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
            リフト一覧
          </h2>
          <Select value={typeFilter} onValueChange={v => v && setTypeFilter(v)}>
            <SelectTrigger className="w-full md:w-[200px] h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map(opt => (
                <SelectItem key={opt} value={opt}>
                  {opt === "全て" ? "すべてのタイプ" : opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Card className="mt-4 w-full overflow-x-auto py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="table-header-cell">名称</TableHead>
                  <TableHead className="table-header-cell">タイプ</TableHead>
                  <TableHead className="table-header-cell">距離 (m)</TableHead>
                  <TableHead className="table-header-cell">
                    フード有無
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedLifts.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="px-4 py-8 text-center text-sm font-semibold text-gray-500"
                    >
                      条件に合うリフトがありません
                    </TableCell>
                  </TableRow>
                )}
                {processedLifts.map(l => (
                  <TableRow
                    key={l.id}
                    className="border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <TableCell className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                      {l.name}
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      <Badge
                        variant="secondary"
                        className="text-xs whitespace-nowrap"
                      >
                        {l.type || "--"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-700 font-mono whitespace-nowrap">
                      {l.distance?.toLocaleString() || "--"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {l.hood || "--"}
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
