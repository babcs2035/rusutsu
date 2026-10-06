"use client";
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import type { SelectedMapFeature } from "@/features/map/types";
import type { FinalizedCourseGroup } from "@/features/resort-detail/types";
import type {
  CourseRecommendation,
  CourseRecommendationSearch,
} from "@/server/course-recommendations/repository";
import { recommendationGrade, recommendationSelection } from "./algorithm";
import { selectCachedRecommendations } from "./cache";
import { useRecommendationCache } from "./RecommendationProvider";

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
  const cache = useRecommendationCache();
  const routes = [
    ...new Set(
      courseGroup.courses
        .map(c => c.routeKey)
        .filter((key): key is string => !!key),
    ),
  ];
  const selected = recommendationSelection(courseGroup.id, courseGroup.courses);
  const key =
    favorites?.ready && favorites.ids.length && selected && cache
      ? JSON.stringify({ resortId, selected, scope: cache.scope })
      : null;
  const [state, setState] = useState<{
    key: string;
    results: CourseRecommendation[];
    status?: CourseRecommendationSearch["status"] | "api_outdated";
    error?: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    void retry;
    if (!key || !cache) return;
    const cached = cache.store.peek(resortId);
    if (cached) {
      const result = selectCachedRecommendations(
        cached,
        JSON.parse(key).selected,
      );
      setState({ key, results: result.recommendations, status: result.status });
      return;
    }
    let disposed = false;
    const deadline = setTimeout(() => {
      if (!disposed) setState({ key, results: [], error: true });
    }, 3000);
    const request = JSON.parse(key);
    startTransition(async () => {
      try {
        const index = await cache.store.get(request.resortId);
        const result = selectCachedRecommendations(index, request.selected);
        if (!disposed)
          setState({
            key,
            results: result.recommendations,
            status: result.status,
          });
      } catch {
        if (!disposed) setState({ key, results: [], error: true });
      } finally {
        clearTimeout(deadline);
      }
    });
    return () => {
      disposed = true;
      clearTimeout(deadline);
    };
  }, [key, retry, cache, resortId]);
  if (!key || !navigate) return null;
  const cached = cache?.store.peek(resortId);
  const immediate =
    cached && selected ? selectCachedRecommendations(cached, selected) : null;
  const current = immediate
    ? {
        results: immediate.recommendations,
        status: immediate.status,
        error: false,
      }
    : state?.key === key
      ? state
      : null;
  return (
    <section
      className="border-t border-gray-200 pt-3"
      aria-label="似ているコース"
    >
      <h3 className="text-sm font-semibold">似ているコース</h3>
      <p className="mb-2 text-xs text-gray-500">
        お気に入りのスキー場から、{routes.length > 1 ? "メインルートの" : ""}
        急斜面の斜度・長さを中心に、圧雪状態や形の近い候補を優先して表示します。
      </p>
      {!current ? (
        <p className="text-xs text-gray-500">検索中…</p>
      ) : current.error || current.status === "api_outdated" ? (
        <div>
          <p className="mb-2 text-xs text-gray-500">
            {current.status === "api_outdated"
              ? "コース比較の更新が必要なため、現在は取得できません。待っても自動では表示されません。"
              : "似ているコースを取得できませんでした。"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              cache?.store.invalidate(resortId);
              setState(null);
              setRetry(n => n + 1);
            }}
          >
            再度検索する
          </Button>
        </div>
      ) : current.results.length === 0 ? (
        <p className="text-xs text-gray-500">
          {current.status === "source_unavailable"
            ? "このコースは現在、類似コースを検索するためのデータがありません。"
            : current.status === "candidates_unavailable"
              ? "お気に入りのスキー場に、比較できるコースデータがありません。"
              : current.status === "no_other_favorites"
                ? "ほかのスキー場をお気に入りに追加すると、似ているコースを探せます。"
                : "条件を満たすコースはありません。"}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {current.results.map(course => {
            const rating = recommendationGrade(course.score);
            return (
              <li key={`${course.resortId}:${course.key}`}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-gray-200 p-3 text-left hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600"
                  onClick={() => navigate(course.resortId, course.selected)}
                >
                  <p className="text-sm font-semibold text-blue-800">
                    {course.name}
                  </p>
                  <p className="my-1 flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant={rating.grade === "A" ? "default" : "secondary"}
                    >
                      {rating.grade} · {rating.label}
                    </Badge>
                    <span className="text-gray-600">
                      地形の近さ{" "}
                      {(Math.floor(course.score * 10) / 10).toFixed(1)} / 100点
                    </span>
                  </p>
                  <p className="text-xs text-gray-600">
                    {course.resortName} ·{" "}
                    {Math.round(course.distance).toLocaleString()}m · 急な区間{" "}
                    {course.steepSlope.toFixed(1)}°（50m平均） · 約
                    {Math.round(course.steepDistance).toLocaleString()}m
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    {rating.grade === "C"
                      ? "条件の違いが大きい参考候補です"
                      : course.steepSlopeDifference < 0.25 &&
                          course.steepDistanceDifference < 0.25
                        ? "急斜面の斜度・長さともに近い"
                        : course.steepSlopeDifference < 0.25
                          ? "急斜面の斜度が近い"
                          : course.steepDistanceDifference < 0.25
                            ? "急な区間の長さが近い"
                            : "全体の条件から選んだ候補です"}
                  </p>
                  {course.shapeDifferent && (
                    <p className="mt-1 text-xs text-gray-600">
                      コースの曲がり方が異なる参考候補です
                    </p>
                  )}
                  {course.groomingDifferent && (
                    <p className="mt-1 text-xs font-medium text-amber-800">
                      圧雪・非圧雪の状態が異なる参考候補です
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {current && !current.error && current.results.length > 0 && (
        <details className="mt-2 text-xs text-gray-500">
          <summary className="cursor-pointer">評価の見方</summary>
          <p className="mt-1">
            急斜面の斜度50%、急な区間の長さ25%、全体の斜度分布15%、全長10%で計算。
            Aは80点以上、Bは60点以上、Cは60点未満です。
            A〜Cは選択中のコースに対する近さを表します。
            点数は地形データの比較値で、体感の一致率や難易度の保証ではありません。
          </p>
          <p className="mt-1">
            最も急な50m区間の平均斜度と、その斜度の80%以上になる区間の総距離を比較します。
            50m未満のコースは全長を使用します。
          </p>
        </details>
      )}
    </section>
  );
}
