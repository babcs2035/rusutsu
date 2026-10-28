"use client";

import { AlertTriangle } from "lucide-react";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import {
  createContext,
  type ReactNode,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCommunityAccount,
  saveCommunityProfile,
} from "@/features/community/actions";
import { CommunityNotificationsLink } from "@/features/community/CommunityNotificationsLink";
import {
  publicLogout,
  readLoginHistory,
  startPublicLogin,
  syncFavorites,
  updateFavorite,
} from "./actions";
import {
  FAVORITES_KEY,
  type LocalFavorites,
  parseLocalFavorites,
  setFavorite,
} from "./storage";

type FavoritesContextValue = {
  ids: string[];
  ready: boolean;
  toggle: (id: string) => void;
  login: (id?: string) => void;
  logout: () => void;
  openAccount: () => void;
};
const FavoritesContext = createContext<FavoritesContextValue | null>(null);
export const useFavorites = () => useContext(FavoritesContext);

export function FavoritesProvider({
  children,
  resortIds,
}: {
  children: ReactNode;
  resortIds: string[];
}) {
  return (
    <SessionProvider
      basePath="/rusutsu/api/auth"
      refetchInterval={300}
      refetchOnWindowFocus
    >
      <FavoritesState resortIds={resortIds}>{children}</FavoritesState>
    </SessionProvider>
  );
}

function FavoritesState({
  children,
  resortIds,
}: {
  children: ReactNode;
  resortIds: string[];
}) {
  const resortKey = JSON.stringify(resortIds.slice().sort());
  const availableResorts = useMemo<Set<string>>(
    () => new Set(JSON.parse(resortKey)),
    [resortKey],
  );
  const { data: session, status, update } = useSession();
  const userId = session?.user?.id ?? null;
  const [snapshot, setSnapshot] = useState<{
    userId: string | null;
    ids: string[];
    ready: boolean;
  }>({ userId: null, ids: [], ready: false });
  const [dialog, setDialog] = useState<{
    id: string;
    step: "choice" | "browser";
  } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [needsCommunityName, setNeedsCommunityName] = useState(false);
  const [communityNameMode, setCommunityNameMode] = useState<
    "GOOGLE" | "NICKNAME" | "ANONYMOUS"
  >("ANONYMOUS");
  const [communityNickname, setCommunityNickname] = useState("");
  const [communitySetupError, setCommunitySetupError] = useState("");
  const checkedCommunityUser = useRef<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const busy = useRef(new Set<string>());
  const generation = useRef(0);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const dismissedInMemory = useRef(false);
  const local = useRef<LocalFavorites>(parseLocalFavorites(null));
  const dismissExpiry = () => {
    setExpired(false);
    dismissedInMemory.current = true;
    try {
      sessionStorage.setItem("rusutsu:login-notice:v1", "dismissed");
    } catch {
      /* Memory state still dismisses it. */
    }
  };
  const persist = useCallback((value: LocalFavorites) => {
    // Throw on storage failure: never claim a browser save succeeded when it did not.
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(value));
    local.current = value;
  }, []);
  useEffect(() => {
    if (!userId) {
      checkedCommunityUser.current = null;
      setNeedsCommunityName(false);
      return;
    }
    if (checkedCommunityUser.current === userId) return;
    checkedCommunityUser.current = userId;
    void getCommunityAccount().then(result => {
      if (!result.ok || result.data?.publicName) return;
      setNeedsCommunityName(true);
      setCommunityNameMode(result.data?.nameMode ?? "ANONYMOUS");
      setCommunityNickname(result.data?.publicName ?? "");
      setAccountOpen(true);
    });
  }, [userId]);
  const refresh = useCallback(() => {
    if (status === "loading" || busy.current.size) return;
    const request = ++generation.current;
    try {
      local.current = parseLocalFavorites(localStorage.getItem(FAVORITES_KEY));
    } catch {
      local.current = parseLocalFavorites(null);
    }
    local.current = {
      ...local.current,
      ids: local.current.ids.filter(id => availableResorts.has(id)),
    };
    // 同じアカウントの再同期中は、前の一覧を使える状態のまま残す。
    // 一度 ready を落とすと、お気に入りに依存する表示（類似コースなど）が
    // タブを戻るたびに作り直されて読み込み直しになる。
    setSnapshot(previous =>
      previous.userId === userId ? previous : { userId, ids: [], ready: false },
    );
    startTransition(async () => {
      try {
        if (userId) {
          const result = await syncFavorites(local.current.ids, userId);
          if (request !== generation.current || currentUser.current !== userId)
            return;
          // Consume guest data after a successful merge. Account data never goes into localStorage.
          // 「このブラウザに保存」の選択も消し、ログアウト後に初めて追加するときにもう一度選んでもらう。
          try {
            persist({ ...local.current, method: null, ids: [] });
          } catch {
            /* Retry the idempotent merge later. */
          }
          setSnapshot({
            userId,
            ids: result.ids.filter(id => availableResorts.has(id)),
            ready: true,
          });
          setExpired(false);
          if (result.addedPending)
            toast.success("お気に入りに追加しました", { duration: 1000 });
        } else {
          setSnapshot({ userId: null, ids: local.current.ids, ready: true });
          const wasLoggedIn = await readLoginHistory();
          if (request !== generation.current || currentUser.current !== null)
            return;
          let dismissed = false;
          try {
            dismissed =
              sessionStorage.getItem("rusutsu:login-notice:v1") === "dismissed";
          } catch {
            /* Use memory dismissal. */
          }
          if (wasLoggedIn && !dismissed && !dismissedInMemory.current)
            setExpired(true);
        }
      } catch {
        if (request === generation.current) {
          setSnapshot({ userId, ids: [], ready: false });
          toast.error("お気に入りを読み込めませんでした。再度お試しください。");
        }
      }
    });
  }, [availableResorts, persist, status, userId]);
  useEffect(() => {
    refresh();
    const storage = (event: StorageEvent) => {
      if (event.key === FAVORITES_KEY) refresh();
    };
    const focus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      ++generation.current;
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);

  const ready =
    status !== "loading" && snapshot.userId === userId && snapshot.ready;
  const ids = ready ? snapshot.ids : [];
  useEffect(() => {
    if (!busyIds.size && status !== "loading" && snapshot.userId !== userId)
      refresh();
  }, [busyIds.size, refresh, snapshot.userId, status, userId]);
  const login = (id?: string) => {
    setDialog(null);
    dismissExpiry();
    startTransition(async () => {
      try {
        await startPublicLogin(
          `${window.location.pathname}${window.location.search}${window.location.hash}`,
          id,
        );
      } catch (error) {
        // Next handles successful redirect actions; actual failures remain on this page.
        if (error instanceof Error && !error.message.includes("NEXT_REDIRECT"))
          toast.error("ログインを開始できませんでした。");
      }
    });
  };
  const save = (id: string, added: boolean) => {
    if (!ready || busy.current.has(id)) return;
    const account = userId;
    const previous = snapshot.ids;
    const next = setFavorite(previous, id, added);
    ++generation.current;
    if (!account) {
      try {
        persist({ version: 1, method: "browser", ids: next });
        setSnapshot({ userId: null, ids: next, ready: true });
        // ログイン中の保存と見分けられるよう、保存先を文言に出す
        toast.success(
          added
            ? "このブラウザにお気に入りを保存しました"
            : "このブラウザのお気に入りから解除しました",
          { duration: 1000 },
        );
      } catch {
        toast.error("このブラウザには保存できませんでした。");
      }
      return;
    }
    busy.current.add(id);
    setBusyIds(new Set(busy.current));
    setSnapshot({ userId: account, ids: next, ready: true });
    startTransition(async () => {
      try {
        await updateFavorite(id, added, account);
        if (currentUser.current === account)
          toast.success(
            added ? "お気に入りに追加しました" : "お気に入りから解除しました",
            { duration: 1000 },
          );
      } catch {
        if (currentUser.current === account) {
          // Roll back this operation only; preserve concurrent changes to other IDs.
          setSnapshot(value => ({
            ...value,
            ids: setFavorite(value.ids, id, !added),
          }));
          toast.error("保存できませんでした。ログイン状態をご確認ください。");
          void update();
        }
      } finally {
        busy.current.delete(id);
        setBusyIds(new Set(busy.current));
      }
    });
  };
  const logout = () => {
    ++generation.current;
    setSnapshot({ userId: null, ids: [], ready: false });
    dismissExpiry();
    startTransition(async () => {
      try {
        await publicLogout();
        // Also broadcast the session change to other tabs through Auth.js.
        await signOut({ redirect: false });
        await update();
      } catch {
        toast.error("ログアウトできませんでした。");
        void update();
      }
    });
  };
  return (
    <FavoritesContext.Provider
      value={{
        ids,
        ready,
        login,
        logout,
        openAccount: () => setAccountOpen(true),
        toggle: id => {
          if (!ready || busyIds.has(id)) return;
          if (!userId && local.current.method === null && !ids.includes(id))
            setDialog({ id, step: "choice" });
          else save(id, !ids.includes(id));
        },
      }}
    >
      {children}
      <Dialog
        open={accountOpen && !!session?.user}
        onOpenChange={setAccountOpen}
      >
        <DialogContent className="z-[1000]" overlayClassName="z-[999]">
          <DialogTitle>アカウント</DialogTitle>
          <DialogDescription>
            {session?.user?.name}
            <br />
            {session?.user?.email}
          </DialogDescription>
          <CommunityNotificationsLink />
          {needsCommunityName && (
            <section className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <h3 className="font-semibold">
                投稿に使う公開名を選んでください
              </h3>
              <p className="text-xs text-gray-700">
                Googleの名前は「Googleアカウント名」を選んだ場合だけ公開されます。
              </p>
              {(
                [
                  ["GOOGLE", "Googleアカウント名"],
                  ["NICKNAME", "ニックネーム"],
                  ["ANONYMOUS", "匿名"],
                ] as const
              ).map(([mode, label]) => (
                <label key={mode} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={communityNameMode === mode}
                    onChange={() => setCommunityNameMode(mode)}
                  />
                  {label}
                </label>
              ))}
              {communityNameMode === "NICKNAME" && (
                <input
                  className="h-9 w-full rounded border bg-white px-2 text-sm"
                  value={communityNickname}
                  onChange={event => setCommunityNickname(event.target.value)}
                  maxLength={40}
                  placeholder="ニックネーム"
                />
              )}
              <Button
                size="sm"
                disabled={
                  communityNameMode === "NICKNAME" && !communityNickname.trim()
                }
                onClick={() =>
                  startTransition(async () => {
                    const result = await saveCommunityProfile(
                      communityNameMode,
                      communityNickname,
                    );
                    if (result.ok) setNeedsCommunityName(false);
                    else setCommunitySetupError(result.error);
                  })
                }
              >
                公開名を保存
              </Button>
              {communitySetupError && (
                <p className="text-xs text-red-700">{communitySetupError}</p>
              )}
            </section>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setAccountOpen(false);
              logout();
            }}
          >
            ログアウト
          </Button>
        </DialogContent>
      </Dialog>
      <Toaster position="bottom-center" style={{ zIndex: 1000 }} />
      <Dialog
        open={!!dialog}
        onOpenChange={open => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="z-[1000]" overlayClassName="z-[999]">
          <DialogTitle className="flex items-center gap-2">
            {dialog?.step === "browser" && (
              <AlertTriangle
                className="size-5 shrink-0 text-amber-600"
                aria-hidden="true"
              />
            )}
            {dialog?.step === "browser"
              ? "保存が消える可能性があります"
              : "お気に入りの保存"}
          </DialogTitle>
          {dialog?.step === "browser" && (
            <DialogDescription>
              ブラウザに保存します。
              <br />
              利用状況によっては、お気に入りが消える可能性があります。
            </DialogDescription>
          )}
          {dialog?.step === "choice" ? (
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="font-semibold md:h-9 md:text-base"
                onClick={() => login(dialog.id)}
              >
                ログインして保存
              </Button>
              <Button
                variant="outline"
                className="font-semibold md:h-9 md:text-base"
                onClick={() => setDialog({ ...dialog, step: "browser" })}
              >
                このブラウザに保存
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  dialog && setDialog({ ...dialog, step: "choice" })
                }
              >
                戻る
              </Button>
              <Button
                onClick={() => {
                  if (dialog) save(dialog.id, true);
                  setDialog(null);
                }}
              >
                保存する
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={expired}
        onOpenChange={open => {
          if (!open) dismissExpiry();
        }}
      >
        <DialogContent className="z-[1000]" overlayClassName="z-[999]">
          <DialogTitle>ログインが解除されています。</DialogTitle>
          <DialogDescription>
            再度ログインすると、保存済みのお気に入りを利用できます。
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={dismissExpiry}>
              あとで
            </Button>
            <Button onClick={() => login()}>Googleでログイン</Button>
          </div>
        </DialogContent>
      </Dialog>
    </FavoritesContext.Provider>
  );
}
