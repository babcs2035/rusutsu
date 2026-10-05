"use client";
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import type { SelectedMapFeature } from "@/features/map/types";
import type { FinalizedCourseGroup } from "@/features/resort-detail/types";
import type { CourseRecommendation } from "@/server/course-recommendations/repository";
import { getCourseRecommendations } from "./actions";
import { recommendationSelection } from "./algorithm";

export const CourseNavigationContext = createContext<
  ((resortId: string, feature: SelectedMapFeature) => void) | null
>(null);
export function SimilarCourses({
  resortId,
  courseGroup,
}: {
  resortId: string;
  courseGroup: FinalizedCourseGroup;
}) {
  const favorites = useFavorites();
  const navigate = useContext(CourseNavigationContext);
  const routes = [
    ...new Set(
      courseGroup.courses
        .map(c => c.routeKey)
        .filter((key): key is string => !!key),
    ),
  ];
  const selected = recommendationSelection(courseGroup.id, courseGroup.courses);
  const key =
    favorites?.ready && favorites.ids.length && selected
      ? JSON.stringify({ resortId, selected, favorites: favorites.ids })
      : null;
  const [state, setState] = useState<{
    key: string;
    results: CourseRecommendation[];
    error?: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    void retry;
    if (!key) return;
    let disposed = false;
    const request = JSON.parse(key);
    startTransition(async () => {
      try {
        const results = await getCourseRecommendations(
          request.resortId,
          request.selected,
          request.favorites,
        );
        if (!disposed) setState({ key, results });
      } catch {
        if (!disposed) setState({ key, results: [], error: true });
      }
    });
    return () => {
      disposed = true;
    };
  }, [key, retry]);
  if (!key || !navigate) return null;
  const current = state?.key === key ? state : null;
  return (
    <section
      className="border-t border-gray-200 pt-3"
      aria-label="似ているコース"
    >
      <h3 className="text-sm font-semibold">似ているコース</h3>
      <p className="mb-2 text-xs text-gray-500">
        お気に入りのスキー場から、{routes.length > 1 ? "メインルートの" : ""}
        斜度分布と距離を比較しています。
      </p>
      {!current ? (
        <p className="text-xs text-gray-500">検索中…</p>
      ) : current.error ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRetry(n => n + 1)}
        >
          再度検索する
        </Button>
      ) : current.results.length === 0 ? (
        <p className="text-xs text-gray-500">
          条件を満たすコースはありません。
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {current.results.map(course => (
            <li key={`${course.resortId}:${course.key}`}>
              <button
                type="button"
                className="w-full rounded-lg border border-gray-200 p-3 text-left hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600"
                onClick={() => navigate(course.resortId, course.selected)}
              >
                <p className="text-sm font-semibold text-blue-800">
                  {course.name}
                </p>
                <p className="text-xs text-gray-600">
                  {course.resortName} ·{" "}
                  {Math.round(course.distance).toLocaleString()}m ·
                  距離加重平均斜度 {Math.round(course.meanSlope)}°
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {course.slopeDifference < 0.25 &&
                  course.lengthDifference < 0.25
                    ? "斜度・距離ともに近い"
                    : course.slopeDifference <= course.lengthDifference
                      ? "斜度分布が近い"
                      : "コース距離が近い"}
                  （計算スコア {course.score.toFixed(0)}点）
                </p>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
