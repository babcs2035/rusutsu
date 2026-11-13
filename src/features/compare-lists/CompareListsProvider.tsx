"use client";

import { useSession } from "next-auth/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { reloadIfStaleBuild } from "@/shared/utils/staleBuild";
import {
  deleteCompareList,
  listCompareLists,
  saveCompareList,
  updateCompareListResorts,
} from "./actions";
import type { CompareListSummary } from "./types";

type CompareListsContextValue = {
  /** ログイン中のときだけ保存できる */
  userId: string | null;
  /** ログイン状態の確認と、リストの初回読み込みが済んだ */
  ready: boolean;
  lists: CompareListSummary[];
  save: (input: {
    id?: string | null;
    name: string;
    resortIds: string[];
  }) => Promise<CompareListSummary | null>;
  remove: (id: string) => Promise<boolean>;
  addResorts: (
    id: string,
    resortIds: string[],
  ) => Promise<CompareListSummary | null>;
  removeResort: (
    id: string,
    resortId: string,
  ) => Promise<CompareListSummary | null>;
};

const CompareListsContext = createContext<CompareListsContextValue | null>(
  null,
);
export const useCompareLists = () => useContext(CompareListsContext);

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
  const [state, setState] = useState<{
    userId: string | null;
    lists: CompareListSummary[];
    ready: boolean;
  }>({ userId: null, lists: [], ready: false });
  const available = useRef(new Set(resortIds));
  available.current = new Set(resortIds);
  const currentUser = useRef(userId);
  currentUser.current = userId;

  const accept = useCallback((account: string, lists: CompareListSummary[]) => {
    if (currentUser.current !== account) return;
    setState({
      userId: account,
      ready: true,
      lists: lists.map(list => ({
        ...list,
        resortIds: list.resortIds.filter(id => available.current.has(id)),
      })),
    });
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!userId) {
      setState({ userId: null, lists: [], ready: true });
      return;
    }
    let disposed = false;
    setState(previous =>
      previous.userId === userId
        ? previous
        : { userId, lists: [], ready: false },
    );
    listCompareLists(userId)
      .then(lists => {
        if (!disposed) accept(userId, lists);
      })
      .catch(error => {
        if (reloadIfStaleBuild(error) || disposed) return;
        setState({ userId, lists: [], ready: true });
      });
    return () => {
      disposed = true;
    };
  }, [accept, status, userId]);

  const save: CompareListsContextValue["save"] = async input => {
    if (!userId) return null;
    try {
      const result = await saveCompareList({
        ...input,
        expectedUserId: userId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return null;
      }
      if (currentUser.current !== userId) return null;
      accept(userId, result.lists);
      toast.success(
        input.id ? "比較リストを更新しました" : "比較リストに保存しました",
        {
          duration: 1200,
        },
      );
      return result.lists.find(list => list.id === result.id) ?? null;
    } catch (error) {
      if (reloadIfStaleBuild(error)) return null;
      toast.error("保存できませんでした。ログイン状態をご確認ください。");
      return null;
    }
  };
  const remove: CompareListsContextValue["remove"] = async id => {
    if (!userId) return false;
    try {
      accept(userId, await deleteCompareList(id, userId));
      toast.success("比較リストを削除しました", { duration: 1000 });
      return true;
    } catch (error) {
      if (reloadIfStaleBuild(error)) return false;
      toast.error("削除できませんでした。");
      return false;
    }
  };

  const updateResorts = async (
    id: string,
    resortIds: string[],
    operation: "add" | "remove",
  ) => {
    if (!userId) return null;
    try {
      const result = await updateCompareListResorts({
        expectedUserId: userId,
        id,
        resortIds,
        operation,
      });
      if (!result.ok) {
        toast.error(result.error);
        return null;
      }
      if (currentUser.current !== userId) return null;
      accept(userId, result.lists);
      toast.success(
        operation === "add"
          ? "比較リストに追加しました"
          : "比較リストから外しました",
        { duration: 1200 },
      );
      return result.lists.find(list => list.id === id) ?? null;
    } catch (error) {
      if (reloadIfStaleBuild(error)) return null;
      toast.error("比較リストを更新できませんでした。");
      return null;
    }
  };

  const ready = status !== "loading" && state.userId === userId && state.ready;
  return (
    <CompareListsContext.Provider
      value={{
        userId,
        ready,
        lists: ready ? state.lists : [],
        save,
        remove,
        addResorts: (id, resortIds) => updateResorts(id, resortIds, "add"),
        removeResort: (id, resortId) => updateResorts(id, [resortId], "remove"),
      }}
    >
      {children}
    </CompareListsContext.Provider>
  );
}
