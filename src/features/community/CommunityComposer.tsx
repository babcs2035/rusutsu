"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCommunityAccount,
  getCommunityCourses,
  getPostDetail,
  publishReport,
  saveCommunityProfile,
  startCommunityLogin,
  updateReport,
} from "@/features/community/actions";
import {
  COURSE_CONDITIONS,
  type CommunityAccount,
  type CommunityMapData,
  ENTRY_KINDS,
  ITEM_TYPES,
  MAX_REPORT_ENTRIES,
  MOGUL_SNOW,
  type PublicPost,
  type ReportDraft,
  type ReportEntryDraft,
  reportDraftSchema,
  SNOW_QUALITIES,
} from "@/features/community/contract";
import { ReportSections } from "./ReportSections";
import { type ReportMapTarget, ReportSelectionMap } from "./ReportSelectionMap";

type Props = { resortId: string; postId?: string };
const photoKeys = new WeakMap<File, string>();
const photoKey = (file: File) => {
  let key = photoKeys.get(file);
  if (!key) {
    key = crypto.randomUUID();
    photoKeys.set(file, key);
  }
  return key;
};
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
const blankEntry = (
  kind: ReportEntryDraft["kind"] = "COURSE",
): ReportEntryDraft => ({
  clientKey: crypto.randomUUID(),
  kind,
  courseId: null,
  liftId: null,
  body: "",
  snowQualities: [],
  conditions: [],
  crowding: null,
  rating: null,
  latitude: null,
  longitude: null,
  present: kind === "MOGUL" || kind === "ITEM" ? true : null,
  itemType: null,
  size: null,
  waitMinutes: null,
});
const blankReport = (): ReportDraft => ({
  observedOn: today(),
  body: "",
  rating: null,
  entries: [],
});
const labelClass = "block space-y-1 text-sm font-medium";
const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const kinds = ["COURSE", "MOGUL", "ITEM", "LIFT"] as const;

export function CommunityComposer({ resortId, postId }: Props) {
  const [account, setAccount] = useState<CommunityAccount | null>(null);
  const [mapData, setMapData] = useState<CommunityMapData | null>(null);
  const [report, setReport] = useState<ReportDraft>(blankReport);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<PublicPost["photos"]>(
    [],
  );
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [savedPostId, setSavedPostId] = useState<string | null>(null);
  const [mode, setMode] = useState<"GOOGLE" | "NICKNAME" | "ANONYMOUS">(
    "ANONYMOUS",
  );
  const [nickname, setNickname] = useState("");
  const [step, setStep] = useState<
    "loading" | "profile" | "edit" | "review" | "done"
  >("loading");
  const [loadingError, setLoadingError] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapTarget, setMapTarget] = useState<ReportMapTarget | null>(null);
  const [mobile, setMobile] = useState(false);
  const [busy, startTransition] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollPosition = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const [pendingErrorEntry, setPendingErrorEntry] = useState<string | null>(
    null,
  );
  const selectedEntry =
    report.entries.find(entry => entry.clientKey === activeKey) ?? null;
  const liveEntries = useMemo(() => report.entries, [report.entries]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setMobile(mq.matches);
      if (!mq.matches) {
        setMapOpen(false);
        setMapTarget(null);
      }
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const key = pendingErrorEntry;
    if (!key || !openKeys.includes(key)) return;
    const element = document.querySelector<HTMLElement>(
      `[data-entry-key="${key}"]`,
    );
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setPendingErrorEntry(null);
  }, [openKeys, pendingErrorEntry]);

  useEffect(() => {
    let alive = true;
    setStep("loading");
    setLoadingError("");
    setError("");
    setNewPhotos([]);
    setRemovedPhotoIds([]);
    setExistingPhotos([]);
    setVersion(null);
    idempotencyKey.current = crypto.randomUUID();
    void (async () => {
      try {
        const [accountResult, coursesResult] = await Promise.all([
          getCommunityAccount(),
          getCommunityCourses(resortId),
        ]);
        if (!alive) return;
        if (!accountResult.ok) {
          setLoadingError(accountResult.error);
          return;
        }
        if (!accountResult.data) {
          void startCommunityLogin(
            `${window.location.pathname}${window.location.search}`,
          );
          return;
        }
        if (!coursesResult.ok) {
          setLoadingError(coursesResult.error);
          return;
        }
        setAccount(accountResult.data);
        setMode(accountResult.data.nameMode ?? "ANONYMOUS");
        setNickname(accountResult.data.publicName ?? "");
        setMapData(coursesResult.data);
        const params = new URLSearchParams(window.location.search);
        const requestedCourse = params.get("courseId");
        const requestedLift = params.get("liftId");
        const initial = blankReport();
        if (
          requestedCourse &&
          coursesResult.data.courses.some(item => item.id === requestedCourse)
        )
          initial.entries.push({
            ...blankEntry("COURSE"),
            courseId: requestedCourse,
          });
        if (
          requestedLift &&
          coursesResult.data.lifts.some(item => item.id === requestedLift)
        )
          initial.entries.push({
            ...blankEntry("LIFT"),
            liftId: requestedLift,
          });
        if (postId) {
          const detail = await getPostDetail(postId);
          if (!alive) return;
          if (!detail.ok) {
            setLoadingError(detail.error);
            return;
          }
          const post = detail.data.post as PublicPost;
          if (post.resortId !== resortId) {
            setLoadingError("この投稿は編集できません。");
            return;
          }
          if (detail.data.viewerId !== post.author.id) {
            setLoadingError("この投稿は編集できません。");
            return;
          }
          initial.observedOn = post.observedOn;
          initial.body = post.body;
          initial.rating = post.rating;
          initial.entries = post.entries.map(
            ({ id: _id, targetName: _name, ...entry }) => ({ ...entry }),
          );
          setExistingPhotos(post.photos);
          setVersion(post.version);
        }
        setReport(initial);
        setOpenKeys(initial.entries.map(entry => entry.clientKey));
        setActiveKey(initial.entries[0]?.clientKey ?? null);
        setStep(accountResult.data.publicName ? "edit" : "profile");
      } catch (cause) {
        if (alive)
          setLoadingError(
            cause instanceof Error
              ? cause.message
              : "投稿の準備に失敗しました。",
          );
      }
    })();
    return () => {
      alive = false;
    };
  }, [resortId, postId]);

  const patchReport = (patch: Partial<ReportDraft>) =>
    setReport(current => ({ ...current, ...patch }));
  const patchEntry = useCallback(
    (key: string, patch: Partial<ReportEntryDraft>) =>
      setReport(current => ({
        ...current,
        entries: current.entries.map(entry =>
          entry.clientKey === key ? { ...entry, ...patch } : entry,
        ),
      })),
    [],
  );
  const addEntry = (kind: ReportEntryDraft["kind"]) => {
    if (report.entries.length >= MAX_REPORT_ENTRIES) return;
    const entry = blankEntry(kind);
    setReport(current => ({
      ...current,
      entries: [...current.entries, entry],
    }));
    setOpenKeys(current => [...current, entry.clientKey]);
    setActiveKey(entry.clientKey);
    if (mobile) openMap(entry.clientKey);
  };
  const deleteEntry = (key: string) => {
    const left = report.entries.filter(entry => entry.clientKey !== key);
    setReport(current => ({
      ...current,
      entries: current.entries.filter(entry => entry.clientKey !== key),
    }));
    setOpenKeys(current => current.filter(item => item !== key));
    if (activeKey === key) setActiveKey(left[0]?.clientKey ?? null);
  };
  const desktopMapSelect = useCallback(
    (target: ReportMapTarget) => {
      if (mobile || mapOpen) {
        setMapTarget(target);
        return;
      }
      if (target.kind === "POINT") {
        if (activeKey)
          patchEntry(activeKey, {
            latitude: target.coordinates[1],
            longitude: target.coordinates[0],
            courseId: target.courseId,
          });
        return;
      }
      const kind = target.kind;
      const active = report.entries.find(
        entry => entry.clientKey === activeKey,
      );
      const existing = report.entries.find(
        entry =>
          entry.kind === kind &&
          (kind === "COURSE" ? entry.courseId : entry.liftId) === target.id,
      );
      if (existing) {
        if (
          active &&
          active.clientKey !== existing.clientKey &&
          active.kind === kind &&
          !active.courseId &&
          !active.liftId &&
          !active.body &&
          !active.snowQualities.length &&
          !active.conditions.length &&
          !active.crowding &&
          active.rating == null &&
          active.waitMinutes == null
        ) {
          setReport(current => ({
            ...current,
            entries: current.entries.filter(
              entry => entry.clientKey !== active.clientKey,
            ),
          }));
          setOpenKeys(current =>
            current.filter(key => key !== active.clientKey),
          );
        }
        setActiveKey(existing.clientKey);
        setOpenKeys(current => [...new Set([...current, existing.clientKey])]);
        return;
      }
      if (active?.kind === kind) {
        patchEntry(active.clientKey, {
          ...(kind === "COURSE"
            ? { courseId: target.id }
            : { liftId: target.id }),
        });
        return;
      }
      if (report.entries.length >= MAX_REPORT_ENTRIES) return;
      const entry = {
        ...blankEntry(kind),
        ...(kind === "COURSE"
          ? { courseId: target.id }
          : { liftId: target.id }),
      };
      setReport(current => ({
        ...current,
        entries: [...current.entries, entry],
      }));
      setActiveKey(entry.clientKey);
      setOpenKeys(current => [...current, entry.clientKey]);
    },
    [activeKey, mapOpen, mobile, patchEntry, report.entries],
  );
  const selectTarget = (key: string, target: ReportMapTarget) => {
    if (target.kind === "POINT")
      patchEntry(key, {
        latitude: target.coordinates[1],
        longitude: target.coordinates[0],
        courseId: target.courseId,
        liftId: null,
      });
    else if (target.kind === "COURSE")
      patchEntry(key, {
        kind: "COURSE",
        courseId: target.id,
        liftId: null,
        latitude: null,
        longitude: null,
        present: null,
        itemType: null,
        size: null,
        waitMinutes: null,
      });
    else
      patchEntry(key, {
        kind: "LIFT",
        liftId: target.id,
        courseId: null,
        latitude: null,
        longitude: null,
        present: null,
        itemType: null,
        size: null,
        waitMinutes: null,
      });
    setMapTarget(target);
  };
  function openMap(key?: string) {
    if (key) setActiveKey(key);
    if (!mobile) {
      setMapOpen(false);
      return;
    }
    scrollPosition.current = mainRef.current?.scrollTop ?? 0;
    setMapTarget(null);
    setMapOpen(true);
  }
  const closeMap = (open: boolean) => {
    setMapOpen(open);
    if (!open)
      requestAnimationFrame(() => {
        if (mainRef.current) mainRef.current.scrollTop = scrollPosition.current;
      });
  };
  const beginReview = () => {
    const parsed = reportDraftSchema.safeParse(report);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        errors[path] ??= issue.message;
        const idx = Number(issue.path[1]);
        if (Number.isInteger(idx) && report.entries[idx]) {
          if (!pendingErrorEntry)
            setPendingErrorEntry(report.entries[idx].clientKey);
          setActiveKey(report.entries[idx].clientKey);
          setOpenKeys(current => [
            ...new Set([...current, report.entries[idx].clientKey]),
          ]);
        }
      }
      setFieldErrors(errors);
      setError("入力内容を確認してください。");
      return;
    }
    setFieldErrors({});
    setError("");
    setStep("review");
  };
  const save = () => {
    const form = new FormData();
    for (const file of newPhotos) form.append("photos", file);
    startTransition(async () => {
      const result =
        postId && version != null
          ? await updateReport(postId, version, report, form, removedPhotoIds)
          : await publishReport(
              { resortId, report, idempotencyKey: idempotencyKey.current },
              form,
            );
      if (!result.ok) {
        setError(result.error);
        setStep("review");
        return;
      }
      setSavedPostId(result.data.id);
      setStep("done");
    });
  };
  const chooseFiles = (files: FileList | null) => {
    if (!files) return;
    const selected = [...files];
    if (selected.some(file => file.size > 8 * 1024 * 1024)) {
      setError("写真は1枚8MB以下にしてください。");
      return;
    }
    const allSize = [...newPhotos, ...selected].reduce(
      (sum, file) => sum + file.size,
      0,
    );
    if (
      newPhotos.length +
        existingPhotos.length -
        removedPhotoIds.length +
        selected.length >
        6 ||
      allSize > 48 * 1024 * 1024
    ) {
      setError("写真は合計6枚、合計48MBまでです。");
      return;
    }
    setNewPhotos(current => [...current, ...selected]);
    setError("");
  };
  const link = `/community/${encodeURIComponent(resortId)}`;

  if (step === "loading")
    return (
      <main className="h-dvh overflow-y-auto p-4">
        {loadingError || "投稿の準備中…"}
      </main>
    );
  if (step === "profile")
    return (
      <main className="mx-auto h-dvh max-w-lg space-y-3 overflow-y-auto p-4">
        <Link className="text-sm underline" href={link}>
          ← 投稿一覧
        </Link>
        <h1 className="text-xl font-bold">公開名を設定</h1>
        <p className="text-sm text-gray-600">
          投稿に表示する名前を選んでください。Googleアカウントの名前は、選択した場合だけ公開されます。
        </p>
        {(
          [
            ["GOOGLE", "Googleアカウントと同じ名前"],
            ["NICKNAME", "ニックネーム"],
            ["ANONYMOUS", "匿名"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex items-center gap-2 rounded border p-3"
          >
            <input
              type="radio"
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {label}
          </label>
        ))}
        {mode === "NICKNAME" && (
          <input
            className={inputClass}
            maxLength={40}
            value={nickname}
            onChange={event => setNickname(event.target.value)}
            placeholder="ニックネーム"
          />
        )}
        <Button
          disabled={busy || (mode === "NICKNAME" && !nickname.trim())}
          onClick={() =>
            startTransition(async () => {
              const result = await saveCommunityProfile(mode, nickname);
              if (result.ok) {
                setAccount(result.data);
                setStep("edit");
              } else setError(result.error);
            })
          }
        >
          保存して投稿へ
        </Button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </main>
    );
  if (step === "done")
    return (
      <main className="mx-auto h-dvh max-w-lg space-y-4 overflow-y-auto p-4">
        <h1 className="text-xl font-bold">
          {postId ? "投稿を更新しました" : "投稿しました"}
        </h1>
        {savedPostId && (
          <Link
            className="block text-sky-800 underline"
            href={`/community/post/${encodeURIComponent(savedPostId)}`}
          >
            投稿を確認する
          </Link>
        )}
        <Link className="text-sky-800 underline" href={link}>
          みんなの投稿へ
        </Link>
      </main>
    );
  if (!mapData)
    return (
      <main className="h-dvh overflow-y-auto p-4 text-sm text-red-700">
        {loadingError || "地図データを読み込めませんでした。"}
      </main>
    );

  const mapSelection =
    mapTarget && activeKey
      ? mapTarget.kind === "POINT"
        ? {
            ...(selectedEntry ?? blankEntry("MOGUL")),
            latitude: mapTarget.coordinates[1],
            longitude: mapTarget.coordinates[0],
            courseId: mapTarget.courseId,
          }
        : mapTarget.kind === "COURSE"
          ? {
              ...(selectedEntry ?? blankEntry("COURSE")),
              kind: "COURSE" as const,
              courseId: mapTarget.id,
              liftId: null,
            }
          : {
              ...(selectedEntry ?? blankEntry("LIFT")),
              kind: "LIFT" as const,
              liftId: mapTarget.id,
              courseId: null,
            }
      : selectedEntry;
  const mapPane = (
    <ReportSelectionMap
      data={mapData}
      selection={mapSelection}
      onSelect={desktopMapSelect}
    />
  );
  const canConfirmMapTarget =
    !!mapTarget &&
    !!selectedEntry &&
    ((mapTarget.kind === "POINT" &&
      (selectedEntry.kind === "MOGUL" || selectedEntry.kind === "ITEM")) ||
      (mapTarget.kind === "COURSE" && selectedEntry.kind === "COURSE") ||
      (mapTarget.kind === "LIFT" && selectedEntry.kind === "LIFT"));
  const rating = (
    value: number | null,
    onChange: (value: number | null) => void,
    title: string,
  ) => (
    <fieldset>
      <legend className="text-sm font-medium">{title}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            type="button"
            key={n}
            className={`px-1 text-xl ${value && n <= value ? "text-amber-500" : "text-gray-300"}`}
            aria-label={`${n}つ星`}
            onClick={() => onChange(value === n ? null : n)}
          >
            ★
          </button>
        ))}
      </div>
    </fieldset>
  );
  const choice = (
    title: string,
    values: readonly string[],
    selected: readonly string[],
    onChange: (values: string[]) => void,
  ) => (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      <div className="flex flex-wrap gap-1.5">
        {values.map(value => (
          <button
            type="button"
            key={value}
            className={`rounded-full border px-2 py-1 text-xs whitespace-nowrap ${selected.includes(value) ? "border-sky-700 bg-sky-50 text-sky-900" : ""}`}
            onClick={() =>
              onChange(
                selected.includes(value)
                  ? selected.filter(item => item !== value)
                  : [...selected, value],
              )
            }
          >
            {value}
          </button>
        ))}
      </div>
    </fieldset>
  );
  const nameOf = (entry: ReportEntryDraft) =>
    entry.kind === "LIFT"
      ? mapData.lifts.find(item => item.id === entry.liftId)?.name
      : mapData.courses.find(item => item.id === entry.courseId)?.name;
  const targetSelect = (entry: ReportEntryDraft) => (
    <label className={labelClass}>
      {entry.kind === "LIFT" ? "対象リフト" : "対象コース"}
      <Select
        value={
          entry.kind === "LIFT" ? (entry.liftId ?? "") : (entry.courseId ?? "")
        }
        items={[
          { value: "", label: "選択してください" },
          ...(entry.kind === "LIFT" ? mapData.lifts : mapData.courses).map(
            item => ({ value: item.id, label: item.name }),
          ),
        ]}
        onValueChange={value =>
          patchEntry(
            entry.clientKey,
            entry.kind === "LIFT"
              ? { liftId: value || null }
              : { courseId: value || null },
          )
        }
      >
        <SelectTrigger className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">選択してください</SelectItem>
          {(entry.kind === "LIFT" ? mapData.lifts : mapData.courses).map(
            item => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
    </label>
  );
  const entryEditor = (entry: ReportEntryDraft) => {
    const entryIndex = report.entries.findIndex(
      item => item.clientKey === entry.clientKey,
    );
    const issues = Object.entries(fieldErrors).filter(([path]) =>
      path.startsWith(`entries.${entryIndex}.`),
    );
    return (
      <div className="space-y-3 border-t pt-3">
        {issues.length > 0 && (
          <ul
            className="list-inside list-disc rounded bg-red-50 p-2 text-xs text-red-800"
            role="alert"
          >
            {issues.map(([path, message]) => (
              <li key={path}>{message}</li>
            ))}
          </ul>
        )}
        {(entry.kind === "COURSE" || entry.kind === "LIFT") && (
          <>
            {targetSelect(entry)}
            <button
              type="button"
              className="h-8 rounded border px-2 text-xs"
              onClick={() => openMap(entry.clientKey)}
            >
              地図で選ぶ
            </button>
          </>
        )}
        {(entry.kind === "MOGUL" || entry.kind === "ITEM") && (
          <>
            <button
              type="button"
              className="h-8 rounded border px-2 text-xs"
              onClick={() => openMap(entry.clientKey)}
            >
              地図で場所を選ぶ
            </button>
            {entry.latitude != null && entry.longitude != null && (
              <p className="text-xs text-gray-600">場所を指定済み</p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={entry.present ?? false}
                onChange={event =>
                  patchEntry(entry.clientKey, { present: event.target.checked })
                }
              />
              {entry.kind === "MOGUL" ? "コブあり" : "設置中"}
            </label>
          </>
        )}
        {entry.kind === "ITEM" && (
          <>
            <label className={labelClass}>
              設備の種類
              <Select
                value={entry.itemType ?? ""}
                items={[
                  { value: "", label: "選択してください" },
                  ...ITEM_TYPES.map(item => ({ value: item, label: item })),
                ]}
                onValueChange={value =>
                  patchEntry(entry.clientKey, {
                    itemType: (value || null) as ReportEntryDraft["itemType"],
                  })
                }
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">選択してください</SelectItem>
                  {ITEM_TYPES.map(item => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className={labelClass}>
              サイズ
              <input
                className={inputClass}
                value={entry.size ?? ""}
                onChange={event =>
                  patchEntry(entry.clientKey, {
                    size: event.target.value || null,
                  })
                }
              />
            </label>
          </>
        )}
        {entry.kind === "COURSE" && (
          <>
            {choice("雪質", SNOW_QUALITIES, entry.snowQualities, values =>
              patchEntry(entry.clientKey, {
                snowQualities: values as ReportEntryDraft["snowQualities"],
              }),
            )}
            {choice("コース状態", COURSE_CONDITIONS, entry.conditions, values =>
              patchEntry(entry.clientKey, {
                conditions: values as ReportEntryDraft["conditions"],
              }),
            )}
          </>
        )}
        {entry.kind === "MOGUL" &&
          choice("コブの雪質", MOGUL_SNOW, entry.snowQualities, values =>
            patchEntry(entry.clientKey, {
              snowQualities: values as ReportEntryDraft["snowQualities"],
            }),
          )}
        {(entry.kind === "COURSE" || entry.kind === "LIFT") && (
          <>
            <label className={labelClass}>
              混雑状況
              <Select
                value={entry.crowding ?? ""}
                items={[
                  { value: "", label: "選択なし" },
                  ...["空いている", "普通", "混雑"].map(item => ({
                    value: item,
                    label: item,
                  })),
                ]}
                onValueChange={value =>
                  patchEntry(entry.clientKey, {
                    crowding: (value || null) as ReportEntryDraft["crowding"],
                  })
                }
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">選択なし</SelectItem>
                  {["空いている", "普通", "混雑"].map(item => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {entry.kind === "LIFT" && (
              <label className={labelClass}>
                待ち時間（分）
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="240"
                  value={entry.waitMinutes ?? ""}
                  onChange={event =>
                    patchEntry(entry.clientKey, {
                      waitMinutes: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                />
              </label>
            )}
            {rating(
              entry.rating,
              value => patchEntry(entry.clientKey, { rating: value }),
              "項目の評価",
            )}
          </>
        )}
        <label className={labelClass}>
          項目の感想
          <textarea
            className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
            maxLength={4000}
            value={entry.body}
            onChange={event =>
              patchEntry(entry.clientKey, { body: event.target.value })
            }
          />
        </label>
      </div>
    );
  };
  const content = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link className="text-xs underline" href={link}>
          ← 投稿一覧
        </Link>
        <span className="text-xs text-gray-500">
          公開名: {account?.publicName}
        </span>
      </div>
      <h1 className="text-lg font-bold">
        {postId ? "レポートを編集" : "滑走レポートを投稿"}
      </h1>
      <p className="text-sm font-semibold text-slate-600">{mapData.name}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">レポート項目</h2>
          <span className="shrink-0 text-xs text-gray-500">
            {report.entries.length}/{MAX_REPORT_ENTRIES}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap gap-1">
          {kinds.map(kind => (
            <button
              type="button"
              key={kind}
              disabled={report.entries.length >= MAX_REPORT_ENTRIES}
              className="h-7 rounded border px-2 text-xs whitespace-nowrap disabled:opacity-50"
              onClick={() => addEntry(kind)}
            >
              ＋{ENTRY_KINDS[kind]}
            </button>
          ))}
        </div>
      </div>
      <label className={labelClass}>
        訪問日
        <input
          type="date"
          max={today()}
          className={inputClass}
          value={report.observedOn}
          onChange={event => patchReport({ observedOn: event.target.value })}
        />
      </label>
      <label className={labelClass}>
        全体の感想
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm"
          maxLength={4000}
          value={report.body}
          onChange={event => patchReport({ body: event.target.value })}
        />
      </label>
      {rating(
        report.rating,
        value => patchReport({ rating: value }),
        "全体の評価",
      )}
      <section className="space-y-2">
        {liveEntries.map((entry, index) => (
          <article
            key={entry.clientKey}
            data-entry-key={entry.clientKey}
            aria-label={`${ENTRY_KINDS[entry.kind]}の項目${index + 1}`}
            className={`rounded-lg border p-3 ${activeKey === entry.clientKey ? "border-sky-600" : ""}`}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-expanded={openKeys.includes(entry.clientKey)}
                className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                onClick={() => {
                  setActiveKey(entry.clientKey);
                  setOpenKeys(current =>
                    current.includes(entry.clientKey)
                      ? current.filter(item => item !== entry.clientKey)
                      : [...current, entry.clientKey],
                  );
                }}
              >
                {ENTRY_KINDS[entry.kind]}
                {nameOf(entry) ? ` · ${nameOf(entry)}` : ` · 項目${index + 1}`}{" "}
                {openKeys.includes(entry.clientKey) ? "⌃" : "⌄"}
              </button>
              {Object.keys(fieldErrors).some(key =>
                key.startsWith(`entries.${index}.`),
              ) && <span className="text-xs text-red-700">要確認</span>}
              <button
                type="button"
                className="h-7 rounded px-2 text-xs text-red-700"
                onClick={() => deleteEntry(entry.clientKey)}
              >
                削除
              </button>
            </div>
            {openKeys.includes(entry.clientKey) && entryEditor(entry)}
          </article>
        ))}
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">写真（全体で6枚まで）</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            写真を追加
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={event => {
              chooseFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </div>
        <div className="space-y-1 text-xs">
          {existingPhotos
            .filter(photo => !removedPhotoIds.includes(photo.id))
            .map(photo => (
              <div
                key={photo.id}
                className="flex items-center justify-between rounded border p-2"
              >
                既存の写真{" "}
                <button
                  type="button"
                  className="text-red-700 underline"
                  onClick={() =>
                    setRemovedPhotoIds(current => [...current, photo.id])
                  }
                >
                  削除
                </button>
              </div>
            ))}
          {newPhotos.map((photo, index) => (
            <div
              key={photoKey(photo)}
              className="flex items-center justify-between rounded border p-2"
            >
              <span className="truncate">{photo.name}</span>
              <button
                type="button"
                className="text-red-700 underline"
                onClick={() =>
                  setNewPhotos(current => current.filter((_, i) => i !== index))
                }
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500">1枚8MB、合計48MBまで</p>
      </section>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={busy} onClick={beginReview}>
        内容を確認
      </Button>
    </div>
  );
  const review = (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">投稿内容の確認</h2>
      <p className="text-sm font-semibold">{mapData.name}</p>
      <p className="text-sm">
        {report.observedOn} · {report.entries.length}項目 · 写真
        {existingPhotos.length - removedPhotoIds.length + newPhotos.length}枚
      </p>
      {report.body && (
        <p className="whitespace-pre-wrap text-sm">{report.body}</p>
      )}
      {report.rating != null && (
        <p className="text-sm">全体の評価：★ {report.rating}</p>
      )}
      <ReportSections
        entries={report.entries.map(entry => ({
          ...entry,
          id: entry.clientKey,
          targetName: nameOf(entry) ?? ENTRY_KINDS[entry.kind],
        }))}
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={busy} onClick={save}>
        {busy ? "保存中…" : postId ? "更新する" : "投稿する"}
      </Button>
      <Button
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={() => setStep("edit")}
      >
        入力に戻る
      </Button>
    </div>
  );

  return (
    <main
      ref={mainRef}
      className="h-dvh min-h-0 overflow-y-auto md:overflow-hidden"
    >
      <div className="grid min-h-full md:h-full md:grid-cols-[minmax(0,1fr)_minmax(480px,560px)]">
        {!mobile && <div className="hidden min-h-0 md:block">{mapPane}</div>}
        <div className="min-h-0 md:overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-3 p-3 pb-8 md:p-5">
            {step === "review" ? review : content}
          </div>
        </div>
      </div>
      {mobile && (
        <Dialog open={mapOpen} onOpenChange={closeMap}>
          <DialogContent className="flex h-[min(88dvh,760px)] max-w-5xl flex-col gap-2 p-3 sm:max-w-5xl">
            <DialogTitle>地図から項目を選択</DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              対象をタップして選び、「選択を確定」を押してください。
            </DialogDescription>
            <div className="min-h-0 flex-1">{mapPane}</div>
            <DialogFooter className="flex-row justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => closeMap(false)}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                disabled={!mapTarget || !activeKey || !canConfirmMapTarget}
                onClick={() => {
                  if (mapTarget && activeKey)
                    selectTarget(activeKey, mapTarget);
                  closeMap(false);
                }}
              >
                選択を確定
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
