"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { SelectedMapFeature } from "@/features/map/JapanResortMap";
import type { ElevationProfileMapPoint } from "@/features/map/types";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import {
  COURSE_DIFFICULTY_META,
  getCourseDifficulty,
} from "@/lib/finalizedResortGeojsonShared";
import { cn } from "@/lib/utils";
import { SelectedCourseDetail } from "../components/SelectedCourseDetail";
import { StatCard } from "../components/StatCard";
import type { FinalizedCourseGroup, Resort } from "../types";
import {
  createFinalizedCourseGroups,
  formatCourseStatus,
  formatMeters,
  formatPisteStatus,
  maxNullable,
} from "../utils/detailMetrics";

const getCourseGroupDistance = (group: FinalizedCourseGroup) => {
  const distances = group.courses
    .map(
      course =>
        course.properties.slopeDistMap ?? course.properties.distance ?? null,
    )
    .filter((distance): distance is number => distance !== null);

  return distances.length > 0
    ? distances.reduce((sum, distance) => sum + distance, 0)
    : null;
};

const getCourseGroupDifficulty = (group: FinalizedCourseGroup) => {
  const primaryCourse = group.courses[0];
  const difficulty = getCourseDifficulty(primaryCourse?.properties.level);
  return COURSE_DIFFICULTY_META[difficulty].label;
};

const getCourseGroupLevelBucket = (group: FinalizedCourseGroup) => {
  const primaryCourse = group.courses[0];
  const difficulty = getCourseDifficulty(primaryCourse?.properties.level);
  if (difficulty === "advanced" || difficulty === "intermediateAdvanced") {
    return "advanced";
  }
  if (difficulty === "intermediate") return "intermediate";
  return "beginner";
};

const getCourseGroupMaxSlope = (group: FinalizedCourseGroup) =>
  maxNullable(
    group.courses.map(
      course => course.properties.maxSlopeDegMap ?? course.properties.max,
    ),
  );

const getCourseGroupElevationDiff = (group: FinalizedCourseGroup) =>
  maxNullable(group.courses.map(course => course.properties.elevationDiffMap));

export const CoursesTab = ({
  resort,
  finalizedMapData,
  selectedFinalizedFeature,
  selectedElevationProfilePoint,
  onSelectedFinalizedFeatureChange,
  onSelectedElevationProfilePointChange,
}: {
  resort: Resort;
  finalizedMapData: FinalizedResortMapData | null;
  selectedFinalizedFeature: SelectedMapFeature | null;
  selectedElevationProfilePoint: ElevationProfileMapPoint | null;
  onSelectedFinalizedFeatureChange: (
    feature: SelectedMapFeature | null,
  ) => void;
  onSelectedElevationProfilePointChange: (
    point: ElevationProfileMapPoint | null,
  ) => void;
}) => {
  const finalizedCourses = finalizedMapData?.courses?.features ?? [];
  const finalizedCourseGroups = useMemo(
    () => createFinalizedCourseGroups(finalizedCourses),
    [finalizedCourses],
  );
  const selectedFinalizedCourseGroup =
    selectedFinalizedFeature?.kind === "course"
      ? (finalizedCourseGroups.find(
          group => group.id === selectedFinalizedFeature.id,
        ) ?? null)
      : null;
  const selectedFinalizedCourse =
    selectedFinalizedCourseGroup?.courses[0] ?? null;
  const courses = resort.courses;
  const hasFinalizedCourses = finalizedCourseGroups.length > 0;
  const [difficultyFilter, setDifficultyFilter] = useState("全て");
  const [sortConfig, setSortConfig] = useState<{
    key: "distance";
    direction: "asc" | "desc";
  } | null>(null);

  const difficultyOptions = useMemo(
    () =>
      hasFinalizedCourses
        ? [
            "全て",
            ...Array.from(
              new Set(finalizedCourseGroups.map(getCourseGroupDifficulty)),
            ),
          ]
        : [
            "全て",
            ...Array.from(
              new Set(
                courses.map(c => c.difficulty).filter(Boolean) as string[],
              ),
            ),
          ],
    [courses, finalizedCourseGroups, hasFinalizedCourses],
  );

  const processedCourses = useMemo(() => {
    let filtered = [...courses];
    if (difficultyFilter !== "全て") {
      filtered = filtered.filter(c => c.difficulty === difficultyFilter);
    }
    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [courses, difficultyFilter, sortConfig]);

  const processedFinalizedCourseGroups = useMemo(() => {
    let filtered = [...finalizedCourseGroups];
    if (difficultyFilter !== "全て") {
      filtered = filtered.filter(
        group => getCourseGroupDifficulty(group) === difficultyFilter,
      );
    }
    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        const aVal = getCourseGroupDistance(a) ?? 0;
        const bVal = getCourseGroupDistance(b) ?? 0;
        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [difficultyFilter, finalizedCourseGroups, sortConfig]);

  const finalizedStats = useMemo(() => {
    const total = finalizedCourseGroups.length;
    const beginner = finalizedCourseGroups.filter(
      group => getCourseGroupLevelBucket(group) === "beginner",
    ).length;
    const intermediate = finalizedCourseGroups.filter(
      group => getCourseGroupLevelBucket(group) === "intermediate",
    ).length;
    const advanced = finalizedCourseGroups.filter(
      group => getCourseGroupLevelBucket(group) === "advanced",
    ).length;

    return {
      total,
      longestDistance: maxNullable(
        finalizedCourseGroups.map(getCourseGroupDistance),
      ),
      maxSlope: maxNullable(finalizedCourseGroups.map(getCourseGroupMaxSlope)),
      maxElevationDiff: maxNullable(
        finalizedCourseGroups.map(getCourseGroupElevationDiff),
      ),
      beginnerPercent: total > 0 ? Math.round((beginner / total) * 100) : 0,
      intermediatePercent:
        total > 0 ? Math.round((intermediate / total) * 100) : 0,
      advancedPercent: total > 0 ? Math.round((advanced / total) * 100) : 0,
    };
  }, [finalizedCourseGroups]);

  if (selectedFinalizedCourseGroup && selectedFinalizedCourse) {
    return (
      <SelectedCourseDetail
        courseGroup={selectedFinalizedCourseGroup}
        selectedElevationProfilePoint={selectedElevationProfilePoint}
        onSelectedElevationProfilePointChange={
          onSelectedElevationProfilePointChange
        }
        onBack={() => {
          onSelectedFinalizedFeatureChange(null);
          onSelectedElevationProfilePointChange(null);
        }}
      />
    );
  }

  const handleSort = (key: "distance") => {
    setSortConfig(prev => ({
      key,
      direction: prev?.direction === "asc" ? "desc" : "asc",
    }));
  };

  if (hasFinalizedCourses) {
    return (
      <div className="flex flex-col gap-6">
        <section>
          <div className="grid grid-cols-2 gap-4">
            <StatCard title="総コース数" value={`${finalizedStats.total}`} />
            <StatCard
              title="最長滑走距離"
              value={formatMeters(finalizedStats.longestDistance)}
            />
            <StatCard
              title="最大斜度"
              value={
                finalizedStats.maxSlope == null
                  ? "--"
                  : `${Math.round(finalizedStats.maxSlope)}°`
              }
            />
            <StatCard
              title="標高差"
              value={formatMeters(finalizedStats.maxElevationDiff)}
            />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
            レベル別割合
          </h2>
          <div className="mt-4 h-6 w-full overflow-hidden rounded-full bg-gray-100 border border-gray-200 text-xs font-bold text-white flex">
            <div
              className="bg-green-500 flex items-center justify-center px-1"
              style={{
                width: `${Math.max(finalizedStats.beginnerPercent, 5)}%`,
              }}
            >
              {finalizedStats.beginnerPercent >= 15 &&
                `${finalizedStats.beginnerPercent}%`}
            </div>
            <div
              className="bg-blue-500 flex items-center justify-center px-1"
              style={{
                width: `${Math.max(finalizedStats.intermediatePercent, 5)}%`,
              }}
            >
              {finalizedStats.intermediatePercent >= 15 &&
                `${finalizedStats.intermediatePercent}%`}
            </div>
            <div
              className="bg-red-500 flex items-center justify-center px-1"
              style={{
                width: `${Math.max(finalizedStats.advancedPercent, 5)}%`,
              }}
            >
              {finalizedStats.advancedPercent >= 15 &&
                `${finalizedStats.advancedPercent}%`}
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-6 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />{" "}
              初級
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />{" "}
              中級
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />{" "}
              上級
            </div>
          </div>
        </section>

        <section>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
              コース一覧
            </h2>
            <Select
              value={difficultyFilter}
              onValueChange={v => v && setDifficultyFilter(v)}
            >
              <SelectTrigger className="w-full md:w-[200px] h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {difficultyOptions.map(opt => (
                  <SelectItem key={opt} value={opt}>
                    {opt === "全て" ? "すべての難易度" : opt}
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
                    <TableHead className="table-header-cell">
                      コース名
                    </TableHead>
                    <TableHead className="table-header-cell">難易度</TableHead>
                    <TableHead className="table-header-cell">
                      <Button
                        onClick={() => handleSort("distance")}
                        variant="ghost"
                        className="px-0 py-0 h-auto min-w-0 text-gray-600 hover:text-blue-700"
                      >
                        距離{" "}
                        {sortConfig?.key === "distance" &&
                          (sortConfig.direction === "asc" ? "▲" : "▼")}
                      </Button>
                    </TableHead>
                    <TableHead className="table-header-cell">状況</TableHead>
                    <TableHead className="table-header-cell">圧雪</TableHead>
                    <TableHead className="table-header-cell">スノボ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedFinalizedCourseGroups.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm font-semibold text-gray-500"
                      >
                        条件に合うコースがありません
                      </TableCell>
                    </TableRow>
                  )}
                  {processedFinalizedCourseGroups.map(group => {
                    const primaryCourse = group.courses[0];
                    const isSelected =
                      selectedFinalizedFeature?.kind === "course" &&
                      selectedFinalizedFeature.id === group.id;
                    return (
                      <TableRow
                        key={group.id}
                        className={cn(
                          "cursor-pointer",
                          isSelected
                            ? "bg-blue-50 hover:bg-blue-100 hover:text-blue-700"
                            : "bg-white hover:bg-gray-50 hover:text-gray-900",
                          "border-b border-gray-200",
                        )}
                        onClick={() =>
                          onSelectedFinalizedFeatureChange({
                            kind: "course",
                            id: group.id,
                          })
                        }
                      >
                        <TableCell className="px-4 py-3 font-semibold whitespace-nowrap">
                          {group.displayName}
                        </TableCell>
                        <TableCell className="px-4 py-3 whitespace-nowrap">
                          <Badge
                            variant="secondary"
                            className="text-xs whitespace-nowrap"
                          >
                            {getCourseGroupDifficulty(group)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 whitespace-nowrap">
                          {formatMeters(getCourseGroupDistance(group))}
                        </TableCell>
                        <TableCell className="px-4 py-3 whitespace-nowrap">
                          {formatCourseStatus(primaryCourse?.properties.status)}
                        </TableCell>
                        <TableCell className="px-4 py-3 whitespace-nowrap">
                          {formatPisteStatus(primaryCourse?.properties.piste)}
                        </TableCell>
                        <TableCell className="px-4 py-3 whitespace-nowrap">
                          {primaryCourse?.properties.snowboard ?? "--"}
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

  const maxSlope = resort.steepestSlope ?? resort.angleMax;
  // 3 セグメントの合計を 100% に正規化する（最低幅クランプによる合計超過・末尾クリップを防止）
  const levelCounts = [
    resort.beginnersCoursesPercent,
    resort.intermediateCoursesPercent,
    resort.advancedCoursesPercent,
  ];
  const levelCountTotal = levelCounts.reduce((sum, value) => sum + value, 0);
  const levelWidths = levelCounts.map(value =>
    levelCountTotal > 0 ? (value / levelCountTotal) * 100 : 0,
  );

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="grid grid-cols-2 gap-4">
          <StatCard title="総コース数" value={`${resort.numberOfCourses}`} />
          <StatCard
            title="最長滑走距離"
            value={formatMeters(resort.longestCourse)}
          />
          <StatCard
            title="最大斜度"
            value={maxSlope == null ? "--" : `${maxSlope}°`}
          />
          <StatCard title="標高差" value={`${resort.verticalDrop}m`} />
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
          レベル別割合
        </h2>
        <div className="mt-4 h-6 w-full overflow-hidden rounded-full bg-gray-100 border border-gray-200 text-xs font-bold text-white flex">
          <div
            className="bg-green-500 flex items-center justify-center px-1"
            style={{ width: `${levelWidths[0]}%` }}
          >
            {resort.beginnersCoursesPercent >= 15 &&
              `${resort.beginnersCoursesPercent}%`}
          </div>
          <div
            className="bg-blue-500 flex items-center justify-center px-1"
            style={{ width: `${levelWidths[1]}%` }}
          >
            {resort.intermediateCoursesPercent >= 15 &&
              `${resort.intermediateCoursesPercent}%`}
          </div>
          <div
            className="bg-red-500 flex items-center justify-center px-1"
            style={{ width: `${levelWidths[2]}%` }}
          >
            {resort.advancedCoursesPercent >= 15 &&
              `${resort.advancedCoursesPercent}%`}
          </div>
        </div>
        <div className="mt-3 flex justify-center gap-6 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />{" "}
            初級
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />{" "}
            中級
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />{" "}
            上級
          </div>
        </div>
      </section>
      <section>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-gray-900 font-[var(--font-heading)]">
            コース一覧
          </h2>
          <Select
            value={difficultyFilter}
            onValueChange={v => v && setDifficultyFilter(v)}
          >
            <SelectTrigger className="w-full md:w-[200px] h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {difficultyOptions.map(opt => (
                <SelectItem key={opt} value={opt}>
                  {opt === "全て" ? "すべての難易度" : opt}
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
                  <TableHead className="table-header-cell">コース名</TableHead>
                  <TableHead className="table-header-cell">難易度</TableHead>
                  <TableHead className="table-header-cell">
                    <Button
                      onClick={() => handleSort("distance")}
                      variant="ghost"
                      className="px-0 py-0 h-auto min-w-0 text-gray-600 hover:text-blue-700"
                    >
                      距離 (m){" "}
                      {sortConfig?.key === "distance" &&
                        (sortConfig.direction === "asc" ? "▲" : "▼")}
                    </Button>
                  </TableHead>
                  <TableHead className="table-header-cell">スノボ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedCourses.map(c => (
                  <TableRow
                    key={c.id}
                    className="border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <TableCell className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                      {c.name}
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      <Badge variant="secondary" className="text-xs">
                        {c.difficulty}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-700 font-mono whitespace-nowrap">
                      {c.distance?.toLocaleString() || "--"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {c.snowboard}
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
