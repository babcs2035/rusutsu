"use client";

import { useSession } from "next-auth/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { withBasePath } from "@/shared/utils/basePath";
import { notifyIfStaleBuild } from "@/shared/utils/staleBuild";
import {
  deleteCompareList,
  renameCompareList,
  reorderCompareList,
  saveCompareList,
  updateCompareListResorts,
} from "./actions";
import { createCompareListMutationQueue } from "./mutationQueue";
import type { CompareListSummary } from "./types";

type CompareListsContextValue = {
  /** ログイン中のときだけ保存できる */
  userId: string | null;
  /** ログイン状態の確認と、リストの初回読み込みが済んだ */
  ready: boolean;
  loadFailed: boolean;
  retryLoad: () => void;
  lists: CompareListSummary[];
  save: (input: {
    name: string;
    resortIds: string[];
  }) => Promise<CompareListSummary | null>;
  remove: (id: string) => Promise<boolean>;
  rename: (id: string, name: string) => Promise<CompareListSummary | null>;
  addResorts: (
    id: string,
    resortIds: string[],
  ) => Promise<CompareListSummary | null>;
  removeResort: (
    id: string,
    resortId: string,
  ) => Promise<CompareListSummary | null>;
  reorder: (
    id: string,
    resortIds: string[],
  ) => Promise<CompareListSummary | null>;
};

const CompareListsContext = createContext<CompareListsContextValue | null>(
  null,
);
export const useCompareLists = () => useContext(CompareListsContext);

type AccountScope = {
  userId: string | null;
  enqueue: ReturnType<typeof createCompareListMutationQueue>;
};

/**
 * 保存した比較リスト（「北海道でよく行く」など）。ログイン中のアカウントに保存する。
 * FavoritesProvider（SessionProvider）の内側に置く。
 */
export function CompareListsProvider({
  children,
  resortIds,
}: {
  children: ReactNode;
  resortIds: string[];
}) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const scope = useMemo<AccountScope>(
    () => ({ userId, enqueue: createCompareListMutationQueue() }),
    [userId],
  );
  const [state, setState] = useState<{
    scope: AccountScope | null;
    lists: CompareListSummary[];
    ready: boolean;
    loadFailed?: boolean;
  }>({ scope: null, lists: [], ready: false });
  const [retryCount, setRetryCount] = useState(0);
  const retryLoad = useCallback((): void => {
    setRetryCount(count => count + 1);
  }, []);
  const available = useRef(new Set(resortIds));
  const currentScope = useRef(scope);
  useLayoutEffect(() => {
    available.current = new Set(resortIds);
    currentScope.current = scope;
  }, [resortIds, scope]);
  const generation = useRef(0);

  const accept = useCallback(
    (account: AccountScope, lists: CompareListSummary[]) => {
      if (currentScope.current !== account) return;
      generation.current++;
      setState({
        scope: account,
        ready: true,
        lists: lists.map(list => ({
          ...list,
          resortIds: list.resortIds.filter(id => available.current.has(id)),
        })),
      });
    },
    [],
  );

  useEffect(() => {
    void retryCount;
    if (status === "loading") return;
    if (!userId) {
      setState({ scope, lists: [], ready: true });
      return;
    }
    const request = ++generation.current;
    const controller = new AbortController();
    setState(previous =>
      previous.scope === scope && !previous.loadFailed
        ? previous
        : { scope, lists: [], ready: false },
    );
    fetch(withBasePath("/api/compare-lists"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedUserId: userId }),
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async response => {
        if (!response.ok) throw new Error("Comparison lists unavailable");
        const lists: CompareListSummary[] = await response.json();
        if (generation.current === request) accept(scope, lists);
      })
      .catch(() => {
        if (
          controller.signal.aborted ||
          generation.current !== request ||
          currentScope.current !== scope
        )
          return;
        setState({ scope, lists: [], ready: true, loadFailed: true });
      });
    return () => {
      controller.abort();
    };
  }, [accept, retryCount, status, scope, userId]);

  const loadFailed = state.scope === scope && state.loadFailed === true;
  useEffect(() => {
    if (!loadFailed) return;
    window.addEventListener("online", retryLoad);
    window.addEventListener("focus", retryLoad);
    return () => {
      window.removeEventListener("online", retryLoad);
      window.removeEventListener("focus", retryLoad);
    };
  }, [loadFailed, retryLoad]);

  const save: CompareListsContextValue["save"] = input =>
    scope.enqueue(async () => {
      if (!userId || currentScope.current !== scope) return null;
      try {
        const result = await saveCompareList({
          ...input,
          expectedUserId: userId,
        });
        if (currentScope.current !== scope) return null;
        if (!result.ok) {
          toast.error(result.error);
          return null;
        }
        accept(scope, result.lists);
        toast.success("比較リストに保存しました", { duration: 1200 });
        return result.lists.find(list => list.id === result.id) ?? null;
      } catch (error) {
        if (currentScope.current !== scope || notifyIfStaleBuild(error))
          return null;
        toast.error("保存できませんでした。ログイン状態をご確認ください。");
        return null;
      }
    });
  const remove: CompareListsContextValue["remove"] = id =>
    scope.enqueue(async () => {
      if (!userId || currentScope.current !== scope) return false;
      try {
        const updated = await deleteCompareList(id, userId);
        if (currentScope.current !== scope) return false;
        accept(scope, updated);
        toast.success("比較リストを削除しました", { duration: 1000 });
        return true;
      } catch (error) {
        if (currentScope.current !== scope || notifyIfStaleBuild(error))
          return false;
        toast.error("削除できませんでした。");
        return false;
      }
    });

  const rename: CompareListsContextValue["rename"] = (id, name) =>
    scope.enqueue(async () => {
      if (!userId || currentScope.current !== scope) return null;
      try {
        const result = await renameCompareList({
          expectedUserId: userId,
          id,
          name,
        });
        if (currentScope.current !== scope) return null;
        if (!result.ok) {
          toast.error(result.error);
          return null;
        }
        accept(scope, result.lists);
        toast.success("リスト名を変更しました", { duration: 1200 });
        return result.lists.find(list => list.id === id) ?? null;
      } catch (error) {
        if (currentScope.current !== scope || notifyIfStaleBuild(error))
          return null;
        toast.error("リスト名を変更できませんでした。");
        return null;
      }
    });

  const updateResorts = (
    id: string,
    resortIds: string[],
    operation: "add" | "remove",
  ): Promise<CompareListSummary | null> =>
    scope.enqueue(async () => {
      if (!userId || currentScope.current !== scope) return null;
      try {
        const result = await updateCompareListResorts({
          expectedUserId: userId,
          id,
          resortIds,
          operation,
        });
        if (currentScope.current !== scope) return null;
        if (!result.ok) {
          toast.error(result.error);
          return null;
        }
        accept(scope, result.lists);
        toast.success(
          operation === "add"
            ? "比較リストに追加しました"
            : "比較リストから外しました",
          { duration: 1200 },
        );
        return result.lists.find(list => list.id === id) ?? null;
      } catch (error) {
        if (currentScope.current !== scope || notifyIfStaleBuild(error))
          return null;
        toast.error("比較リストを更新できませんでした。");
        return null;
      }
    });

  const reorder: CompareListsContextValue["reorder"] = (id, resortIds) =>
    scope.enqueue(async () => {
      if (!scope.userId || currentScope.current !== scope) return null;
      try {
        const result = await reorderCompareList({
          expectedUserId: scope.userId,
          id,
          resortIds,
        });
        if (currentScope.current !== scope) return null;
        if (!result.ok) {
          toast.error(result.error);
          return null;
        }
        accept(scope, result.lists);
        return result.lists.find(list => list.id === id) ?? null;
      } catch (error) {
        if (currentScope.current !== scope || notifyIfStaleBuild(error))
          return null;
        toast.error("並び順を保存できませんでした。");
        return null;
      }
    });

  const ready = status !== "loading" && state.scope === scope && state.ready;
  return (
    <CompareListsContext.Provider
      value={{
        userId,
        ready,
        loadFailed,
        retryLoad,
        lists: ready ? state.lists : [],
        save,
        remove,
        rename,
        addResorts: (id, resortIds) => updateResorts(id, resortIds, "add"),
        removeResort: (id, resortId) => updateResorts(id, [resortId], "remove"),
        reorder,
      }}
    >
      {children}
    </CompareListsContext.Provider>
  );
}
