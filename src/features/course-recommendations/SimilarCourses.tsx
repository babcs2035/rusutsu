"use client";
import {
  createContext,
  type ReactNode,
  startTransition,
  useContext,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { useFavorites } from "@/features/favorites/FavoritesProvider";
import type { SelectedMapFeature } from "@/features/map/types";
import { FeatureSectionTitle } from "@/features/resort-detail/components/FeatureHeadline";
import type { FinalizedCourseGroup } from "@/features/resort-detail/types";
import type { FinalizedResortMapData } from "@/lib/finalizedResortGeojsonShared";
import type {
  CourseRecommendation,
  CourseRecommendationSearch,
} from "@/server/course-recommendations/repository";
import { DetailButton } from "@/shared/components/DetailButton";
import { recommendationGrade, recommendationSelection } from "./algorithm";
import { CourseComparisonDialog } from "./CourseComparisonDialog";
import { selectCachedRecommendations } from "./cache";
import { prefetchComparisonMapData } from "./comparisonData";
import { useRecommendationCache } from "./RecommendationProvider";

const GRADE_CLASS = {
  A: "bg-emerald-600 text-white",
  B: "bg-amber-400 text-amber-950",
  C: "bg-slate-200 text-slate-700",
};

export const CourseNavigationContext = createContext<
  ((resortId: string, feature: SelectedMapFeature) => void) | null
>(null);
/**
 * 地図のラベルと同じ省略名（スキー場ID → 表示名）。
 * 推薦結果の名前はAPIの版によって正式名のことがあるので、表示はこちらを優先する。
 */
export const ResortLabelNameContext = createContext<Map<string, string> | null>(
  null,
);
export function SimilarCourses({
  resortId,
  resortName,
  courseGroup,
  mapData,
  children,
  showHeading = true,
}: {
  resortId: string;
  resortName: string;
  courseGroup: FinalizedCourseGroup;
  /** 表示中のスキー場の地図データ。比較の地図にそのまま使う */
  mapData?: FinalizedResortMapData | null;
  /** 検索結果と件数を使って、呼び出し側でタブなどの配置を組む */
  children?: (content: ReactNode, count: number | null) => ReactNode;
  showHeading?: boolean;
}) {
  const favorites = useFavorites();
  const navigate = useContext(CourseNavigationContext);
  const labelNames = useContext(ResortLabelNameContext);
  const cache = useRecommendationCache();
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
  const [comparison, setComparison] = useState<CourseRecommendation | null>(
    null,
  );
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
  if (!key) return children ? children(null, null) : null;
  const cached = cache?.store.peek(resortId);
  const immediate =
    cached && selected ? selectCachedRecommendations(cached, selected) : null;
  // 期限切れで取り直している間も、前の結果を出し続ける
  const stale = cache?.store.peekStale(resortId);
  const previous =
    stale && selected ? selectCachedRecommendations(stale, selected) : null;
  const loaded = state?.key === key ? state : null;
  const current = immediate
    ? {
        results: immediate.recommendations,
        status: immediate.status,
        error: false,
      }
    : loaded && !loaded.error
      ? loaded
      : previous
        ? {
            results: previous.recommendations,
            status: previous.status,
            error: false,
          }
        : loaded;
  const content = (
    <section className="min-w-0" aria-label="類似コース">
      {showHeading ? (
        <FeatureSectionTitle aside="お気に入りのスキー場から">
          類似コース
        </FeatureSectionTitle>
      ) : (
        <p className="mb-1 text-xs text-slate-500">お気に入りのスキー場から</p>
      )}
      {!current ? (
        <p role="status" className="py-1 text-xs text-slate-500">
          検索中…
        </p>
      ) : current.error || current.status === "api_outdated" ? (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <p>類似コースを取得できませんでした。</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              cache?.store.invalidate(resortId);
              setState(null);
              setRetry(n => n + 1);
            }}
          >
            再検索
          </Button>
        </div>
      ) : current.results.length === 0 ? (
        <p className="py-1 text-xs text-slate-500">
          {current.status === "source_unavailable"
            ? "比較に必要なコースデータがありません。"
            : current.status === "candidates_unavailable"
              ? "お気に入りに比較できるコースデータがありません。"
              : current.status === "no_other_favorites"
                ? "ほかのスキー場をお気に入りに追加すると表示されます。"
                : "条件に合うコースがありません。"}
        </p>
      ) : (
        <table className="w-full table-fixed overflow-hidden rounded-lg border border-slate-200 text-left">
          <colgroup>
            <col className="w-[4.5rem]" />
            <col className="w-[24%]" />
            <col />
            <col className="w-16" />
          </colgroup>
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th scope="col" className="px-2 py-1 font-medium">
                類似度
              </th>
              <th scope="col" className="px-2 py-1 font-medium">
                スキー場
              </th>
              <th scope="col" className="px-2 py-1 font-medium">
                コース
              </th>
              <th scope="col">
                <span className="sr-only">比較</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {current.results.slice(0, 3).map(result => {
              const course = {
                ...result,
                resortName:
                  labelNames?.get(result.resortId) ?? result.resortName,
              };
              const rating = recommendationGrade(course.score);
              return (
                <tr key={`${course.resortId}:${course.key}`}>
                  <td className="px-2 py-1.5" title={rating.label}>
                    <span className="flex items-center gap-1">
                      <span
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${GRADE_CLASS[rating.grade]}`}
                      >
                        {rating.grade}
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-900">
                        {Math.round(course.score)}
                        <span className="text-[10px] font-normal text-slate-500">
                          点
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="truncate px-2 py-1.5 text-xs text-slate-600">
                    {course.resortName}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      disabled={!navigate}
                      title={`${course.resortName} ${course.name}を地図で見る`}
                      className="block w-full truncate text-left text-sm font-semibold text-blue-700 underline-offset-2 hover:underline disabled:text-slate-900 disabled:no-underline focus-visible:outline-2 focus-visible:outline-blue-600"
                      onClick={() =>
                        navigate?.(course.resortId, course.selected)
                      }
                    >
                      {course.name}
                    </button>
                  </td>
                  <td className="py-1 pr-1.5">
                    <DetailButton
                      compact
                      className="ml-auto"
                      // 押す前から比較先の地図データを読み始める
                      onPointerEnter={() =>
                        prefetchComparisonMapData(course.resortId)
                      }
                      onPointerDown={() =>
                        prefetchComparisonMapData(course.resortId)
                      }
                      onFocus={() => prefetchComparisonMapData(course.resortId)}
                      aria-label={`${course.resortName} ${course.name}との比較詳細`}
                      onClick={() => setComparison(course)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {comparison && (
        <CourseComparisonDialog
          key={`${comparison.resortId}:${comparison.key}`}
          resortId={resortId}
          resortName={resortName}
          courseGroup={courseGroup}
          mapData={mapData}
          candidate={comparison}
          onClose={() => setComparison(null)}
        />
      )}
    </section>
  );
  const count =
    current && !current.error && current.status !== "api_outdated"
      ? Math.min(current.results.length, 3)
      : null;
  return children ? children(content, count) : content;
}
