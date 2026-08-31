"use client";

import { useMemo } from "react";
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
import { cn } from "@/lib/utils";
import { buildDefaultSearchWord } from "@/shared/utils/searchWord";
import type { EditorCourse, ResortOption } from "../types";
import { distanceM } from "../utils/geo";

type Props = {
  resort: ResortOption;
  resorts: ResortOption[];
  courses: EditorCourse[];
  setCourses: (updater: (courses: EditorCourse[]) => EditorCourse[]) => void;
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string | null) => void;
  onProceed: () => void;
  onBackToSelect: () => void;
};

const NEARBY_OPTION_COUNT = 20;

const formatDistance = (meters: number): string =>
  meters < 1_000
    ? `${Math.round(meters)}m`
    : `${(meters / 1_000).toFixed(1)}km`;

const distanceToCourse = (course: EditorCourse, resort: ResortOption): number =>
  Math.min(
    ...course.coordinates.map(coordinate =>
      distanceM(coordinate, [resort.longitude, resort.latitude]),
    ),
  );

export function AssignStep({
  resort,
  resorts,
  courses,
  setCourses,
  selectedCourseId,
  onSelectCourse,
  onProceed,
  onBackToSelect,
}: Props) {
  const resortById = useMemo(
    () => new Map(resorts.map(option => [option.id, option])),
    [resorts],
  );
  const optionsByCourseId = useMemo(() => {
    const result = new Map<string, Array<{ id: string; label: string }>>();
    for (const course of courses) {
      const sorted = resorts
        .map(option => ({
          option,
          distance: distanceToCourse(course, option),
        }))
        .sort((a, b) => a.distance - b.distance);
      const nearby = sorted.slice(0, NEARBY_OPTION_COUNT);
      for (const requiredId of [course.skiId, course.originalSkiId]) {
        if (nearby.some(item => item.option.id === requiredId)) continue;
        const required = sorted.find(item => item.option.id === requiredId);
        if (required) nearby.push(required);
      }
      result.set(
        course.id,
        nearby.map(({ option, distance }) => ({
          id: option.id,
          label: `${option.id}（${option.nameJa}, ${formatDistance(distance)}）`,
        })),
      );
    }
    return result;
  }, [courses, resorts]);

  const updateSkiId = (courseId: string, skiId: string) => {
    setCourses(previous =>
      previous.map(course => {
        if (course.id !== courseId) return course;
        const currentName =
          resortById.get(course.skiId)?.searchName ?? course.skiId;
        const nextName = resortById.get(skiId)?.searchName ?? skiId;
        const currentDefault = buildDefaultSearchWord(currentName, course.name);
        return {
          ...course,
          skiId,
          detail: {
            ...course.detail,
            searchWord:
              course.detail.searchWord.trim() === "" ||
              course.detail.searchWord === currentDefault
                ? buildDefaultSearchWord(nextName, course.name)
                : course.detail.searchWord,
          },
        };
      }),
    );
  };

  const changedCount = courses.filter(
    course => course.skiId !== course.originalSkiId,
  ).length;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden border-l border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold font-[var(--font-heading)]">
            {resort.nameJa}
          </h2>
          <p className="text-xs text-orange-900">OpenStreetMap由来・未確認</p>
        </div>
        <Button size="sm" variant="outline" onClick={onBackToSelect}>
          スキー場選択へ戻る
        </Button>
      </div>
      <Card>
        <CardContent className="p-3 text-xs text-gray-600">
          距離で自動割当した所属を確認してください。変更したコースは保存時に移動先の
          slope_before_osm / slope_10m_osm へ移ります。
          {changedCount > 0 && (
            <p className="mt-1 font-bold text-orange-900">
              所属変更: {changedCount}件
            </p>
          )}
        </CardContent>
      </Card>
      <div className="min-h-[200px] flex-1 overflow-y-auto rounded-md border border-gray-200">
        {courses.map((course, index) => {
          const changed = course.skiId !== course.originalSkiId;
          return (
            <div
              key={course.id}
              role="button"
              tabIndex={0}
              className={cn(
                "cursor-pointer border-b border-gray-100 p-2",
                selectedCourseId === course.id && "bg-blue-50",
              )}
              onClick={() => onSelectCourse(course.id)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectCourse(course.id);
                }
              }}
            >
              <div className="flex items-center gap-2">
                <span className="w-6 text-xs text-gray-500">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {course.name || "無名コース"}
                </span>
                {changed && (
                  <Badge
                    className="bg-orange-100 text-orange-900"
                    variant="secondary"
                  >
                    変更
                  </Badge>
                )}
              </div>
              <div className="mt-1 pl-8">
                <Select
                  value={course.skiId}
                  onValueChange={value =>
                    value && updateSkiId(course.id, value)
                  }
                >
                  <SelectTrigger className="w-full bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(optionsByCourseId.get(course.id) ?? []).map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {changed && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={event => {
                      event.stopPropagation();
                      updateSkiId(course.id, course.originalSkiId);
                    }}
                  >
                    元に戻す
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Button onClick={onProceed} disabled={courses.length === 0}>
        次へ（コース線編集）
      </Button>
    </div>
  );
}
