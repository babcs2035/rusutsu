"use client";

import {
  Check,
  ChevronLeft,
  Clock3,
  Images,
  LocateFixed,
  Minus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  getCommunityAccount,
  getPostDetail,
  prepareCommunityPhoto,
  publishReport,
  saveCommunityProfile,
  startCommunityLogin,
  updateReport,
} from "@/features/community/actions";
import {
  COURSE_STATUSES,
  type CommunityMapData,
  CROWDING,
  ENTRY_KINDS,
  ITEM_TYPES,
  LIFT_SPEED_LEVELS,
  LIFT_STATUSES,
  MOGUL_DEPTHS,
  type PublicPhoto,
  type PublicPost,
  type ReportEntryDraft,
  type ReportMapTarget,
  reportDraftSchema,
  SIZED_ITEM_TYPES,
  SNOW_QUALITIES,
} from "@/features/community/contract";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import styles from "./CommunityComposer.module.css";
import { rememberCommunityPost } from "./CommunityMapOverlay";
import {
  composerDraftSchema,
  currentTokyoDateTime,
  geolocationMessage,
} from "./composerDraft";
import {
  type DraftScope,
  deleteDraft,
  loadDraft,
  saveDraft,
} from "./draftStorage";
import { onLoginWindowDone, openLoginWindow } from "./LoginWindow";
import { nearestCourseId, reportLocationError } from "./location";
import { readPhotoMetadata } from "./photoGps";

type Kind = ReportEntryDraft["kind"];
// 入力途中の状態。種類を選ぶ前は項目がなく、時刻も空のことがある。
// 送信時に reportDraftSchema（日時必須・1項目）で確かめる。
type ComposerDraft = {
  observedOn: string;
  observedTime: string | null;
  entries: ReportEntryDraft[];
};
type FeatureTarget = { kind: "COURSE" | "LIFT"; id: string };

type Props = {
  resortId: string;
  /** 詳細の地図で読み込み済みのコース・リフト。投稿画面では取り直さない */
  mapData: CommunityMapData;
  postId?: string;
  allowPreview?: boolean;
  embedded?: boolean;
  onClose?: () => void;
  onStartNew?: () => void;
  /** PCの背後の地図で、クリックを地点の指定に使うかどうか */
  onMapPickModeChange?: (mode: "POINT" | null) => void;
  onMapPointChange?: (point: [number, number] | null) => void;
  /** 選んだコース・リフトを背後の地図でも選択状態にする */
  onTargetChange?: (target: FeatureTarget | null) => void;
  initialTarget?: FeatureTarget;
  selectedMapTarget?: ReportMapTarget | null;
};

const KINDS = ["COURSE", "LIFT", "MOGUL", "ITEM"] as const;
// 開いている・注意・閉じているを、緑・黄・赤とアイコンで一目で分かるようにする
const STATUS_STYLES: Record<
  NonNullable<ReportEntryDraft["status"]>,
  { icon: ReactNode; mark: string; selected: string }
> = {
  オープン: {
    icon: <Check strokeWidth={3.5} />,
    mark: "bg-green-600 text-white",
    selected: "border-green-600 bg-green-50 text-green-800",
  },
  積雪不足: {
    // 丸ではなく、三角の注意マークそのものを出す
    icon: <TriangleAlert className="size-3.5 fill-yellow-400 text-gray-900" />,
    mark: "",
    selected: "border-yellow-500 bg-yellow-50 text-yellow-900",
  },
  減速中: {
    // 丸ではなく、三角の注意マークそのものを出す
    icon: <TriangleAlert className="size-3.5 fill-yellow-400 text-gray-900" />,
    mark: "",
    selected: "border-yellow-500 bg-yellow-50 text-yellow-900",
  },
  クローズ: {
    icon: <Minus strokeWidth={4} />,
    mark: "bg-red-600 text-white",
    selected: "border-red-600 bg-red-50 text-red-800",
  },
};
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 1;

const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
const blankEntry = (kind: Kind): ReportEntryDraft => ({
  clientKey: crypto.randomUUID(),
  kind,
  courseId: null,
  liftId: null,
  body: "",
  snowQualities: [],
  status: null,
  crowding: null,
  latitude: null,
  longitude: null,
  itemType: null,
  size: null,
  waitMinutes: null,
  liftSpeed: null,
  liftSpeedLevel: null,
  depth: null,
});
const blankReport = (): ComposerDraft => ({
  observedOn: today(),
  observedTime: null,
  entries: [],
});
const isPointKind = (kind: Kind) => kind === "MOGUL" || kind === "ITEM";
const photoUrl = (id: string) =>
  `/rusutsu/api/community/photos/${encodeURIComponent(id)}?size=thumb`;

// 項目名の下に「必須」「任意」を小さく添える。欄の高さ（h-8）に収まるよう行送りを詰める
const labelClass =
  "flex w-[4.5rem] shrink-0 flex-col pt-0.5 text-sm leading-tight font-medium text-gray-700 md:text-base";
const chipClass = (selected: boolean) =>
  cn(
    "h-7 min-w-0 rounded-md border px-2 text-xs font-medium whitespace-nowrap",
    selected
      ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-600 hover:text-white hover:brightness-95"
      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900",
  );

function Field({
  label,
  required = false,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  /** 投稿を押したときに足りなかった必須項目の警告 */
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className={labelClass}>
        <span className="flex items-center gap-1">{label}</span>
        <span
          className={cn(
            "text-[10px] leading-3 font-normal",
            required ? "text-red-600" : "text-gray-400",
          )}
        >
          {required ? "必須" : "任意"}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        {children}
        {error && (
          <p data-field-error className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// 小数第1位までの数字だけを受け付ける（上下の矢印やホイールで値が変わらないよう text で扱う）
const DECIMAL_1 = /^\d{0,3}(\.\d?)?$/;
const toSpeedNumber = (text: string) => {
  const value = Number(text);
  return text !== "" && text !== "." && Number.isFinite(value) ? value : null;
};
const round1 = (value: number) => Math.round(value * 10) / 10;

function Chips<T extends string>({
  label,
  values,
  selected,
  multiple = false,
  onChange,
}: {
  label: string;
  values: readonly T[];
  selected: readonly T[];
  multiple?: boolean;
  onChange: (values: T[]) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-1.5">
      <legend className="sr-only">{label}</legend>
      {values.map(value => {
        const checked = selected.includes(value);
        return (
          <Button
            type="button"
            key={value}
            variant="outline"
            aria-pressed={checked}
            className={chipClass(checked)}
            onClick={() =>
              onChange(
                checked
                  ? selected.filter(item => item !== value)
                  : multiple
                    ? [...selected, value]
                    : [value],
              )
            }
          >
            {value}
          </Button>
        );
      })}
    </fieldset>
  );
}

export function CommunityComposer({
  resortId,
  mapData,
  postId,
  allowPreview = false,
  embedded = false,
  onClose,
  onStartNew,
  onMapPickModeChange,
  onMapPointChange,
  onTargetChange,
  initialTarget,
  selectedMapTarget = null,
}: Props) {
  const [step, setStep] = useState<
    "loading" | "login" | "profile" | "choose" | "edit" | "done"
  >("loading");
  const [loadingError, setLoadingError] = useState("");
  const [previewOnly, setPreviewOnly] = useState(false);
  const [nameMode, setNameMode] = useState<"GOOGLE" | "NICKNAME" | "ANONYMOUS">(
    "ANONYMOUS",
  );
  const [nickname, setNickname] = useState("");
  // 1回の投稿は1項目。入力中の項目は entries[0] に持つ。
  const [report, setReport] = useState<ComposerDraft>(blankReport);
  const [editingPostId, setEditingPostId] = useState(postId ?? null);
  const [version, setVersion] = useState<number | null>(null);
  const [savedPhotos, setSavedPhotos] = useState<PublicPhoto[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<{ file: File; url: string }[]>([]);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const [pinOnly, setPinOnly] = useState(false);
  // 「2.」のような入力途中の文字を残すため、数値とは別に持つ。
  const [liftSpeedText, setLiftSpeedText] = useState("");
  const [kmhText, setKmhText] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [draftNotice, setDraftNotice] = useState("");
  const [restoredNotice, setRestoredNotice] = useState("");
  const [activeIdentity, setActiveIdentity] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());
  const timeEdited = useRef(false);
  const locationEdited = useRef(false);
  const targetEdited = useRef(false);
  const geoRequest = useRef(0);
  const draftScope = useRef<DraftScope | null>(null);
  const draftEnabled = useRef(false);
  const photosMissing = useRef(false);
  const restoredSpeed = useRef<{
    liftSpeedText: string;
    kmhText: string;
  } | null>(null);
  const mounted = useRef(true);
  const lastExternalTarget = useRef<ReportMapTarget | null>(null);
  const initialTargetRef = useRef(initialTarget);
  const mapDataRef = useRef(mapData);
  mapDataRef.current = mapData;
  const newPhotosRef = useRef(newPhotos);
  newPhotosRef.current = newPhotos;
  const reportRef = useRef(report);
  reportRef.current = report;
  const callbacks = useRef({ onMapPickModeChange, onMapPointChange });
  callbacks.current = { onMapPickModeChange, onMapPointChange };

  const entry = report.entries[0] ?? null;
  const missing: Record<string, string> = {};
  if (entry) {
    if (!report.observedOn || !report.observedTime)
      missing.日時 = "日付と時刻を入力してください。";
    if (
      isPointKind(entry.kind) &&
      (entry.latitude == null || entry.longitude == null)
    )
      missing.場所 = "地図で場所を指定してください。";
    if (entry.kind === "COURSE" && !entry.courseId)
      missing.コース = "コースを選択してください。";
    if (entry.kind === "LIFT" && !entry.liftId)
      missing.リフト = "リフトを選択してください。";
    if ((entry.kind === "COURSE" || entry.kind === "LIFT") && !entry.status)
      missing.状況 = "状況を選択してください。";
    if (entry.kind === "ITEM" && !entry.itemType)
      missing.アイテム = "アイテムを選択してください。";
    if (entry.longitude != null && entry.latitude != null) {
      const locationError = reportLocationError(
        [entry.longitude, entry.latitude],
        mapData,
      );
      if (locationError) missing.場所 = locationError;
    }
  }
  const fieldError = (label: string) =>
    showErrors ? missing[label] : undefined;
  const visibleSavedPhotos = savedPhotos.filter(
    photo => !removedPhotoIds.includes(photo.id),
  );
  const photoCount = visibleSavedPhotos.length + newPhotos.length;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      geoRequest.current++;
      for (const photo of newPhotosRef.current) URL.revokeObjectURL(photo.url);
      callbacks.current.onMapPickModeChange?.(null);
      callbacks.current.onMapPointChange?.(null);
    };
  }, []);

  // ログインしているかはブラウザが持つセッションで先に分かるので、
  // 未ログインならサーバーに問い合わせずにログインの案内を出す。
  const {
    data: session,
    status: sessionStatus,
    update: refreshSession,
  } = useSession();
  const sessionIdentity = session?.user?.id ?? "";
  // 別ウィンドウでログインしたら、ログイン状態だけ読み直して入力画面へ進む
  useEffect(
    () => onLoginWindowDone(() => void refreshSession()),
    [refreshSession],
  );
  const signedOut = sessionStatus === "unauthenticated";
  useEffect(() => {
    if (sessionStatus === "loading") return;
    let alive = true;
    draftEnabled.current = false;
    draftScope.current = null;
    geoRequest.current++;
    setLocating(false);
    setStep("loading");
    setLoadingError("");
    setDraftNotice("");
    setRestoredNotice("");
    for (const photo of newPhotosRef.current) URL.revokeObjectURL(photo.url);
    setNewPhotos([]);
    setSavedPhotos([]);
    setRemovedPhotoIds([]);
    setVersion(null);
    setEditingPostId(postId ?? null);
    timeEdited.current = false;
    locationEdited.current = false;
    targetEdited.current = false;
    setPinOnly(false);
    photosMissing.current = false;
    void (async () => {
      try {
        // 開発中の確認用。未ログインでも、このブラウザで有効にしたときだけ入力画面を開く
        let canPreview = false;
        try {
          canPreview =
            allowPreview &&
            !postId &&
            localStorage.getItem("rusutsu:composer-preview") === "1";
        } catch {
          /* Preview stays off. */
        }
        const accountResult =
          signedOut && !canPreview
            ? null
            : await getCommunityAccount().catch(() => undefined);
        if (!alive) return;
        if (accountResult === undefined) {
          setLoadingError("投稿の準備に失敗しました。");
          return;
        }
        if (accountResult && !accountResult.ok) {
          setLoadingError(accountResult.error);
          return;
        }
        const courses = mapDataRef.current;
        const account = accountResult?.data ?? null;
        if (!account && !canPreview) {
          setActiveIdentity(sessionIdentity);
          setStep("login");
          return;
        }
        if (account) {
          setNameMode(account.nameMode ?? "ANONYMOUS");
          setNickname(account.publicName ?? "");
        }
        setPreviewOnly(canPreview && !account?.publicName);
        const initial = blankReport();
        const target = initialTargetRef.current;
        if (
          target &&
          (target.kind === "COURSE" ? courses.courses : courses.lifts).some(
            item => item.id === target.id,
          )
        ) {
          targetEdited.current = true;
          initial.entries = [
            {
              ...blankEntry(target.kind),
              ...(target.kind === "COURSE"
                ? { courseId: target.id }
                : { liftId: target.id }),
            },
          ];
        }
        let currentVersion: number | null = null;
        let currentPhotos: PublicPhoto[] = [];
        if (postId) {
          const detail = await getPostDetail(postId);
          if (!alive) return;
          if (!detail.ok) {
            setLoadingError(detail.error);
            return;
          }
          const post = detail.data.post as PublicPost;
          if (
            post.resortId !== resortId ||
            detail.data.viewerId !== post.author.id
          ) {
            setLoadingError("この投稿は編集できません。");
            return;
          }
          initial.observedOn = post.observedOn;
          initial.observedTime = post.observedTime;
          initial.entries = post.entries.map(
            ({ id: _id, targetName: _name, photos: _photos, ...item }) => item,
          );
          timeEdited.current = true;
          locationEdited.current = true;
          targetEdited.current = true;
          currentVersion = post.version;
          currentPhotos = post.entries[0]?.photos ?? [];
          setSavedPhotos(post.entries[0]?.photos ?? []);
          setVersion(post.version);
        }
        const scope: DraftScope = {
          userId: sessionIdentity || account?.id || "development-preview",
          resortId,
          postId,
        };
        let restoredReport = initial;
        try {
          const stored = await loadDraft(scope);
          if (!alive) return;
          if (stored) {
            const parsed = composerDraftSchema.safeParse(stored.data);
            if (parsed.success && parsed.data.version === currentVersion) {
              const saved = parsed.data;
              restoredReport = saved.report;
              timeEdited.current = saved.timeEdited;
              locationEdited.current = saved.locationEdited;
              targetEdited.current = saved.targetEdited;
              setPinOnly(saved.pinOnly);
              idempotencyKey.current = saved.idempotencyKey;
              setRemovedPhotoIds(
                saved.removedPhotoIds.filter(id =>
                  currentPhotos.some(photo => photo.id === id),
                ),
              );
              // Preserve legacy drafts visibly; require removing extra photos
              // before submission rather than silently discarding their data.
              const validFiles = stored.files.filter(
                file => file.size > 0 && file.size <= MAX_PHOTO_BYTES,
              );
              setNewPhotos(
                validFiles.map(file => ({
                  file,
                  url: URL.createObjectURL(file),
                })),
              );
              photosMissing.current =
                stored.photosMissing ||
                saved.photosMissing ||
                validFiles.length !== stored.files.length;
              if (photosMissing.current)
                setDraftNotice(
                  "下書きの写真を復元できませんでした。写真を再選択してください。",
                );
              restoredSpeed.current = {
                liftSpeedText: saved.liftSpeedText,
                kmhText: saved.kmhText,
              };
              setRestoredNotice("下書きを復元しました。");
            } else {
              setRestoredNotice(
                postId
                  ? "投稿が更新されているため、以前の下書きは復元していません。"
                  : "下書きを読み込めませんでした。",
              );
            }
          }
        } catch {
          if (alive)
            setDraftNotice(
              "下書きを読み込めません。このブラウザでは自動保存を利用できない可能性があります。",
            );
        }
        if (!alive) return;
        draftScope.current = scope;
        draftEnabled.current = true;
        setReport(restoredReport);
        setActiveIdentity(sessionIdentity);
        setStep(
          !account?.publicName && !canPreview
            ? "profile"
            : restoredReport.entries.length
              ? "edit"
              : "choose",
        );
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
  }, [
    allowPreview,
    resortId,
    postId,
    sessionStatus,
    signedOut,
    sessionIdentity,
  ]);

  const patchEntry = useCallback(
    (patch: Partial<ReportEntryDraft>) =>
      setReport(current => ({
        ...current,
        entries: current.entries.map((item, index) =>
          index === 0 ? { ...item, ...patch } : item,
        ),
      })),
    [],
  );
  const startEntry = useCallback(
    (kind: Kind, patch: Partial<ReportEntryDraft> = {}) => {
      locationEdited.current = false;
      targetEdited.current = Boolean(patch.courseId || patch.liftId);
      setPinOnly(false);
      geoRequest.current++;
      setLocating(false);
      setReport(current => ({
        ...current,
        entries: [{ ...blankEntry(kind), ...patch }],
      }));
      setStep("edit");
    },
    [],
  );

  // 地点から近い対象を補完する。手動で選んだ対象は保ち、
  // 自動補完した対象は地点の変更に合わせて更新する。
  const applyPoint = useCallback(
    (point: [number, number], courseId?: string | null, manual = true) => {
      const current = reportRef.current.entries[0];
      if (!current) return;
      if (manual) {
        locationEdited.current = true;
        setPinOnly(true);
        onTargetChange?.(null);
        geoRequest.current++;
        setLocating(false);
        setLocationAccuracy(null);
        setError("");
      }
      const patch: Partial<ReportEntryDraft> = {
        longitude: point[0],
        latitude: point[1],
      };
      if (current.kind !== "LIFT" && !targetEdited.current)
        patch.courseId = courseId ?? nearestCourseId(point, mapData.courses);
      else if (current.kind === "LIFT" && !targetEdited.current)
        patch.liftId = nearestCourseId(point, mapData.lifts);
      patchEntry(patch);
    },
    [mapData, patchEntry, onTargetChange],
  );

  const applyMapTarget = useCallback(
    (target: ReportMapTarget) => {
      const current = reportRef.current.entries[0];
      if (target.kind === "POINT") {
        if (!current) return;
        // Keep the map in pin mode while filling the nearby target in the form.
        applyPoint(target.coordinates);
        return;
      }
      if (!current) {
        targetEdited.current = true;
        startEntry(
          target.kind,
          target.kind === "COURSE"
            ? { courseId: target.id }
            : { liftId: target.id },
        );
        return;
      }
      if (current.kind === target.kind) {
        setPinOnly(false);
        targetEdited.current = true;
        patchEntry(
          target.kind === "COURSE"
            ? { courseId: target.id }
            : { liftId: target.id },
        );
      }
    },
    [applyPoint, patchEntry, startEntry],
  );

  useEffect(() => {
    if (!selectedMapTarget) {
      lastExternalTarget.current = null;
      return;
    }
    if (step !== "choose" && step !== "edit") return;
    if (lastExternalTarget.current === selectedMapTarget) return;
    lastExternalTarget.current = selectedMapTarget;
    applyMapTarget(selectedMapTarget);
  }, [applyMapTarget, selectedMapTarget, step]);

  const entryKey = entry?.clientKey;
  useEffect(() => {
    const current = reportRef.current.entries.find(
      item => item.clientKey === entryKey,
    );
    const speed = current?.liftSpeed;
    setLiftSpeedText(
      restoredSpeed.current?.liftSpeedText ?? speed?.toString() ?? "",
    );
    setKmhText(
      restoredSpeed.current?.kmhText ??
        (speed == null ? "" : (speed * 3.6).toFixed(1)),
    );
    restoredSpeed.current = null;
    setShowErrors(false);
  }, [entryKey]);

  const draftState = useRef({
    pinOnly,
    report,
    version,
    removedPhotoIds,
    liftSpeedText,
    kmhText,
  });
  draftState.current = {
    pinOnly,
    report,
    version,
    removedPhotoIds,
    liftSpeedText,
    kmhText,
  };
  const persistDraft = useCallback(async () => {
    const scope = draftScope.current;
    if (!scope || !draftEnabled.current) return true;
    const data = {
      ...draftState.current,
      idempotencyKey: idempotencyKey.current,
      timeEdited: timeEdited.current,
      locationEdited: locationEdited.current,
      targetEdited: targetEdited.current,
      photosMissing: photosMissing.current,
    };
    try {
      const result = await saveDraft(
        scope,
        data,
        newPhotosRef.current.map(photo => photo.file),
      );
      if (
        mounted.current &&
        draftScope.current === scope &&
        draftEnabled.current
      )
        setDraftNotice(
          result.photosSaved
            ? photosMissing.current
              ? "下書きの写真を復元できませんでした。写真を再選択してください。"
              : ""
            : "写真を下書きに保存できませんでした。画面を開き直した際は写真を再選択してください。",
        );
      return result.photosSaved;
    } catch {
      if (
        mounted.current &&
        draftScope.current === scope &&
        draftEnabled.current
      )
        setDraftNotice(
          "下書きを保存できませんでした。ブラウザの空き容量や保存設定を確認してください。",
        );
      return false;
    }
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Persist each input change through refs, including raw numeric text and photo selection.
  useEffect(() => {
    if (
      (step === "edit" || step === "choose") &&
      activeIdentity === sessionIdentity
    )
      void persistDraft();
  }, [
    report,
    pinOnly,
    version,
    removedPhotoIds,
    newPhotos,
    liftSpeedText,
    kmhText,
    step,
    activeIdentity,
    sessionIdentity,
    persistDraft,
  ]);
  useEffect(() => {
    const flush = () => void persistDraft();
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [persistDraft]);

  const acquireLocation = () => {
    if (!navigator.geolocation) {
      setError(
        "このブラウザでは現在位置を取得できません。地図で場所を選んでください。",
      );
      return;
    }
    const request = ++geoRequest.current;
    const key = reportRef.current.entries[0]?.clientKey;
    setLocating(true);
    setError("");
    try {
      navigator.geolocation.getCurrentPosition(
        position => {
          if (
            !mounted.current ||
            request !== geoRequest.current ||
            reportRef.current.entries[0]?.clientKey !== key
          )
            return;
          const { longitude, latitude, accuracy } = position.coords;
          if (
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude) ||
            Math.abs(longitude) > 180 ||
            Math.abs(latitude) > 90
          ) {
            setLocating(false);
            setError(geolocationMessage(2));
            return;
          }
          applyPoint([longitude, latitude]);
          setLocationAccuracy(Number.isFinite(accuracy) ? accuracy : null);
        },
        cause => {
          if (!mounted.current || request !== geoRequest.current) return;
          setLocating(false);
          setError(geolocationMessage(cause.code));
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    } catch {
      setLocating(false);
      setError(geolocationMessage(2));
    }
  };

  useEffect(() => {
    onMapPickModeChange?.(null);
  }, [onMapPickModeChange]);
  useEffect(() => {
    onMapPointChange?.(
      step === "edit" && entry?.latitude != null && entry.longitude != null
        ? [entry.longitude, entry.latitude]
        : null,
    );
  }, [entry?.latitude, entry?.longitude, onMapPointChange, step]);
  // コブ・アイテムのコースは地点から決まるので、地図の選択は動かさない。
  const featureTarget =
    step !== "edit" || pinOnly
      ? null
      : entry?.kind === "LIFT" && entry.liftId
        ? `LIFT:${entry.liftId}`
        : entry?.kind === "COURSE" && entry.courseId
          ? `COURSE:${entry.courseId}`
          : null;
  const sentFeatureTarget = useRef(false);
  useEffect(() => {
    // 選ばせた分だけ外す。投稿前から地図で選んでいたものはそのまま残す。
    if (!featureTarget) {
      if (sentFeatureTarget.current) onTargetChange?.(null);
      sentFeatureTarget.current = false;
      return;
    }
    sentFeatureTarget.current = true;
    const separator = featureTarget.indexOf(":");
    onTargetChange?.({
      kind: featureTarget.slice(0, separator) as FeatureTarget["kind"],
      id: featureTarget.slice(separator + 1),
    });
  }, [featureTarget, onTargetChange]);

  const clearNewPhotos = () => {
    for (const photo of newPhotosRef.current) URL.revokeObjectURL(photo.url);
    setNewPhotos([]);
  };
  const resetForNext = () => {
    if (editingPostId && onStartNew) {
      onStartNew();
      return;
    }
    if (draftScope.current)
      draftScope.current = { ...draftScope.current, postId: undefined };
    clearNewPhotos();
    setSavedPhotos([]);
    setRemovedPhotoIds([]);
    setEditingPostId(null);
    setVersion(null);
    setReport(blankReport());
    setError("");
    timeEdited.current = false;
    idempotencyKey.current = crypto.randomUUID();
    locationEdited.current = false;
    targetEdited.current = false;
    setPinOnly(false);
    photosMissing.current = false;
    draftEnabled.current = true;
    setDraftNotice("");
    setRestoredNotice("");
    setStep("choose");
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || processingPhotos) return;
    const selected = [...files];
    if (selected.length !== MAX_PHOTOS) {
      setError("写真は1枚だけ選択してください。");
      return;
    }
    if (selected.some(file => file.size > MAX_PHOTO_BYTES)) {
      setError("写真は1枚8MB以下にしてください。");
      return;
    }
    const entryKey = reportRef.current.entries[0]?.clientKey;
    const scope = draftScope.current;
    setProcessingPhotos(true);
    setError("");
    const accepted: { file: File; url: string }[] = [];
    try {
      let takenAt: { observedOn: string; observedTime: string | null } | null =
        null;
      let gps: [number, number] | null = null;
      for (const original of selected) {
        const metadata = await readPhotoMetadata(original);
        takenAt ??= metadata.observedOn
          ? {
              observedOn: metadata.observedOn,
              observedTime: metadata.observedTime,
            }
          : null;
        gps ??= metadata.gps
          ? [metadata.gps.longitude, metadata.gps.latitude]
          : null;
        let file = original;
        if (
          /^image\/hei[cf]/i.test(original.type) ||
          /\.(?:heic|heif)$/i.test(original.name)
        ) {
          const form = new FormData();
          form.append("photo", original);
          const result = await prepareCommunityPhoto(form);
          if (!result.ok) throw new Error(result.error);
          const bytes = Uint8Array.from(atob(result.data.base64), character =>
            character.charCodeAt(0),
          );
          const name =
            original.name.replace(/\.(?:heic|heif)$/i, "") || "photo";
          file = new File([bytes], `${name}.webp`, { type: "image/webp" });
        }
        accepted.push({ file, url: URL.createObjectURL(file) });
      }
      // 準備中に種類を選び直したら、別の項目には付けない。
      if (
        !mounted.current ||
        draftScope.current !== scope ||
        reportRef.current.entries[0]?.clientKey !== entryKey
      ) {
        for (const photo of accepted) URL.revokeObjectURL(photo.url);
        return;
      }
      for (const photo of newPhotosRef.current) URL.revokeObjectURL(photo.url);
      setNewPhotos(accepted);
      setRemovedPhotoIds(savedPhotos.map(photo => photo.id));
      photosMissing.current = false;
      if (takenAt && !timeEdited.current) {
        timeEdited.current = true;
        const { observedOn, observedTime } = takenAt;
        setReport(current => ({ ...current, observedOn, observedTime }));
      }
      const current = reportRef.current.entries[0];
      if (gps && current && !locationEdited.current && current.latitude == null)
        applyPoint(gps, undefined, false);
    } catch (cause) {
      for (const photo of accepted) URL.revokeObjectURL(photo.url);
      if (!mounted.current || draftScope.current !== scope) return;
      setError(
        cause instanceof Error ? cause.message : "写真を準備できませんでした。",
      );
    } finally {
      if (mounted.current && draftScope.current === scope)
        setProcessingPhotos(false);
    }
  };

  const save = () => {
    if (processingPhotos || locating || !entry) return;
    if (photoCount > MAX_PHOTOS) {
      setError(
        "写真は1件の投稿で1枚までです。不要な写真を削除するか、選び直してください。",
      );
      return;
    }
    if (Object.keys(missing).length) {
      setShowErrors(true);
      setError("未入力の必須項目があります。");
      requestAnimationFrame(() =>
        document
          .querySelector("[data-field-error]")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
      return;
    }
    setShowErrors(false);
    if (previewOnly) {
      setError("プレビューでは送信できません。");
      return;
    }
    const draft = {
      observedOn: report.observedOn,
      observedTime: report.observedTime,
      entries: [{ ...entry, body: entry.body.trim() }],
    };
    const parsed = reportDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "入力を確認してください。");
      return;
    }
    const form = new FormData();
    for (const { file } of newPhotos)
      form.append(`photos:${entry.clientKey}`, file);
    startTransition(async () => {
      const submittingScope = draftScope.current;
      try {
        const result =
          editingPostId && version != null
            ? await updateReport(
                editingPostId,
                version,
                parsed.data,
                form,
                removedPhotoIds,
              )
            : await publishReport(
                {
                  resortId,
                  report: parsed.data,
                  idempotencyKey: idempotencyKey.current,
                },
                form,
              );
        if (!result.ok) {
          if (!mounted.current || draftScope.current !== submittingScope)
            return;
          setError(result.error);
          return;
        }
        if (!mounted.current || draftScope.current !== submittingScope) return;
        geoRequest.current++;
        setLocating(false);
        if (submittingScope) {
          if (draftScope.current === submittingScope)
            draftEnabled.current = false;
          await deleteDraft(submittingScope).catch(() => {
            if (mounted.current)
              setDraftNotice(
                "投稿は完了しましたが、端末の下書きを削除できませんでした。",
              );
          });
        }
        if (!mounted.current || draftScope.current !== submittingScope) return;
        setError("");
        rememberCommunityPost(resortId);
        setStep("done");
      } catch {
        if (mounted.current && draftScope.current === submittingScope)
          setError(
            "送信できませんでした。写真の容量や通信状況を確認して、もう一度お試しください。",
          );
      }
    });
  };

  const close = () => {
    geoRequest.current++;
    onMapPickModeChange?.(null);
    onMapPointChange?.(null);
    onClose?.();
  };
  const requestClose = async () => {
    const scope = draftScope.current;
    const saved = await persistDraft();
    if (!mounted.current || draftScope.current !== scope) return;
    if (saved) close();
    else setConfirmClose(true);
  };
  const header = (title: string, onBack?: () => void) => (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 py-2 pr-2 pl-3 md:pr-3 md:pl-4">
      <div className="flex min-w-0 items-center gap-1">
        {onBack && (
          <Button
            type="button"
            aria-label="投稿の種類に戻る"
            variant="ghost"
            className="-ml-1.5 size-7 min-w-7 rounded-full p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900 md:size-8 md:min-w-8"
            onClick={onBack}
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </Button>
        )}
        <h2 className="min-w-0 truncate text-base leading-snug font-bold text-gray-900 font-[var(--font-heading)] md:text-lg">
          {title}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {(step === "edit" || step === "choose") && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="下書きを破棄"
            title="下書きを破棄"
            className="size-7 text-gray-500 md:size-8"
            disabled={busy || processingPhotos}
            onClick={() => setConfirmClose(true)}
          >
            <Trash2 size={16} />
          </Button>
        )}
        {embedded && onClose && (
          <Button
            type="button"
            aria-label="投稿を閉じる"
            variant="ghost"
            className="flex size-7 min-h-7 shrink-0 items-center justify-center rounded-full border border-gray-200 p-0 text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10 md:size-8 md:min-h-8"
            disabled={busy || processingPhotos}
            onClick={() => void requestClose()}
          >
            <X size={18} strokeWidth={2.5} />
          </Button>
        )}
      </div>
    </div>
  );
  const shell = (title: string, body: ReactNode, footer?: ReactNode) => (
    <main
      className={cn(
        "@container/composer flex w-full min-w-0 min-h-0 flex-col overflow-hidden bg-white",
        embedded ? "h-full" : "h-dvh",
      )}
    >
      {header(
        title,
        step === "edit" && !editingPostId
          ? () => {
              clearNewPhotos();
              setError("");
              setReport(current => ({ ...current, entries: [] }));
              setStep("choose");
            }
          : undefined,
      )}
      <div className="min-w-0 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        {restoredNotice && (
          <p role="status" className="px-3 pt-2 text-xs text-gray-600 md:px-4">
            {restoredNotice}
          </p>
        )}
        {draftNotice && (
          <p role="status" className="px-3 pt-2 text-xs text-amber-800 md:px-4">
            {draftNotice}
          </p>
        )}
        {body}
      </div>
      {footer}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent overlayClassName="z-[900]" className="z-[901]">
          <AlertDialogHeader>
            <AlertDialogTitle>下書きを破棄して閉じますか？</AlertDialogTitle>
          </AlertDialogHeader>
          {draftNotice && (
            <p className="text-sm text-amber-800">{draftNotice}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>入力に戻る</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async event => {
                event.preventDefault();
                const scope = draftScope.current;
                draftEnabled.current = false;
                geoRequest.current++;
                try {
                  if (scope) await deleteDraft(scope);
                } catch {
                  if (!mounted.current || draftScope.current !== scope) return;
                  draftEnabled.current = true;
                  setDraftNotice(
                    "下書きを削除できませんでした。ブラウザの保存設定を確認してください。",
                  );
                  return;
                }
                if (!mounted.current || draftScope.current !== scope) return;
                setConfirmClose(false);
                clearNewPhotos();
                setReport(blankReport());
                setDraftNotice("");
                setRestoredNotice("");
                if (!onClose) setStep("choose");
                close();
              }}
            >
              破棄して閉じる
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );

  if (
    step === "loading" ||
    sessionStatus === "loading" ||
    activeIdentity !== sessionIdentity
  )
    return shell(
      "現地レポート",
      loadingError ? (
        <p className="p-3 text-sm text-gray-700 md:p-4 md:text-base">
          {loadingError}
        </p>
      ) : (
        <LoadingSpinner className="h-full bg-white" />
      ),
    );

  if (step === "login")
    return shell(
      "現地レポート",
      <div className="space-y-3 p-3 md:p-4">
        <p className="text-sm text-gray-900 md:text-base">
          現地レポートを投稿するにはログインが必要です
        </p>
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => {
            // ログイン後は投稿画面を開いた状態で戻る（別ウィンドウを開けないときの戻り先）
            const back = new URL(window.location.href);
            back.searchParams.set("compose", "1");
            const target = initialTargetRef.current;
            if (target)
              back.searchParams.set(
                target.kind === "COURSE" ? "courseId" : "liftId",
                target.id,
              );
            const returnTo = `${back.pathname}${back.search}`;
            if (openLoginWindow(returnTo)) return;
            startTransition(async () => {
              await startCommunityLogin(returnTo);
            });
          }}
        >
          Googleでログイン
        </Button>
      </div>,
    );

  if (step === "profile")
    return shell(
      "公開名を設定",
      <div className="space-y-2 p-3 md:p-4">
        {(
          [
            ["GOOGLE", "Googleアカウントと同じ名前"],
            ["NICKNAME", "ニックネーム"],
            ["ANONYMOUS", "匿名"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm md:text-base"
          >
            <input
              type="radio"
              checked={nameMode === value}
              onChange={() => setNameMode(value)}
            />
            {label}
          </label>
        ))}
        {nameMode === "NICKNAME" && (
          <Input
            maxLength={40}
            value={nickname}
            onChange={event => setNickname(event.target.value)}
            placeholder="ニックネーム"
          />
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button
          className="w-full"
          disabled={busy || (nameMode === "NICKNAME" && !nickname.trim())}
          onClick={() =>
            startTransition(async () => {
              const result = await saveCommunityProfile(nameMode, nickname);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setError("");
              setStep(reportRef.current.entries.length ? "edit" : "choose");
            })
          }
        >
          保存
        </Button>
      </div>,
    );

  if (step === "done")
    return shell(
      "現地レポート",
      <div className="space-y-3 p-3 md:p-4">
        <p className="text-base font-semibold text-gray-900 md:text-lg">
          {version != null ? "更新しました" : "投稿ありがとうございます"}
        </p>
        <Button variant="outline" className="w-full" onClick={resetForNext}>
          別の投稿をする
        </Button>
      </div>,
    );

  if (step === "choose" || !entry)
    return shell(
      "現地レポート",
      <div className="space-y-2 p-3 md:p-4">
        <p className="text-sm text-gray-600 @min-[30rem]/resort-detail:text-base">
          どの項目についてレポートしますか？
        </p>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map(kind => (
            <Button
              key={kind}
              type="button"
              variant="outline"
              className="h-12 text-sm font-semibold text-gray-800 md:text-base"
              onClick={() => startEntry(kind)}
            >
              {ENTRY_KINDS[kind]}
            </Button>
          ))}
        </div>
      </div>,
    );

  const hasLocation = entry.latitude != null && entry.longitude != null;

  const targetSelect = (lift: boolean, optional: boolean) => {
    const options = lift ? mapData.lifts : mapData.courses;
    const value = (lift ? entry.liftId : entry.courseId) ?? "";
    const placeholder = optional ? "指定なし" : "選択してください";
    return (
      <div className="flex gap-1.5">
        <Select
          value={value}
          items={[
            { value: "", label: placeholder },
            ...options.map(item => ({ value: item.id, label: item.name })),
          ]}
          onValueChange={next => {
            setPinOnly(false);
            targetEdited.current = true;
            patchEntry(
              lift ? { liftId: next || null } : { courseId: next || null },
            );
          }}
        >
          <SelectTrigger
            aria-label={lift ? "リフト" : "コース"}
            className="h-8 min-w-0 flex-1"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{placeholder}</SelectItem>
            {options.map(item => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };
  const statusField = (values: readonly (keyof typeof STATUS_STYLES)[]) => (
    <Field label="状況" required error={fieldError("状況")}>
      <fieldset className="flex flex-wrap gap-1">
        <legend className="sr-only">状況</legend>
        {values.map(status => {
          const checked = entry.status === status;
          const style = STATUS_STYLES[status];
          return (
            <Button
              type="button"
              key={status}
              variant="outline"
              aria-pressed={checked}
              className={cn(
                "h-7 gap-0.5 rounded-md border px-1 text-xs font-medium whitespace-nowrap",
                checked
                  ? cn(style.selected, "font-bold hover:brightness-95")
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              )}
              onClick={() => patchEntry({ status: checked ? null : status })}
            >
              {style.mark ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-3.5 items-center justify-center rounded-full [&_svg]:!size-2",
                    style.mark,
                  )}
                >
                  {style.icon}
                </span>
              ) : (
                <span aria-hidden="true" className="flex">
                  {style.icon}
                </span>
              )}
              {status}
            </Button>
          );
        })}
      </fieldset>
    </Field>
  );
  const snowField =
    entry.kind === "LIFT" ? null : (
      <Field label="雪質">
        <Chips
          label="雪質"
          multiple
          values={SNOW_QUALITIES}
          selected={entry.snowQualities.filter(
            (value): value is (typeof SNOW_QUALITIES)[number] =>
              (SNOW_QUALITIES as readonly string[]).includes(value),
          )}
          onChange={snowQualities => patchEntry({ snowQualities })}
        />
      </Field>
    );

  const allPhotos = [
    ...visibleSavedPhotos.map(photo => ({
      key: photo.id,
      src: photoUrl(photo.id),
      remove: () => setRemovedPhotoIds(current => [...current, photo.id]),
    })),
    ...newPhotos.map(photo => ({
      key: photo.url,
      src: photo.url,
      remove: () => {
        URL.revokeObjectURL(photo.url);
        setNewPhotos(current => current.filter(item => item !== photo));
      },
    })),
  ];

  const form = (
    <div className="w-full min-w-0 space-y-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-16 w-16 flex-col gap-0 px-0 text-[11px] text-gray-600"
          disabled={processingPhotos}
          onClick={() => document.getElementById("community-photo")?.click()}
        >
          {processingPhotos ? (
            <Spinner className="size-5" />
          ) : (
            <Images className="size-5" />
          )}
          {photoCount > 0 ? "写真を変更" : "写真を選択"}
          <span className="text-[10px] leading-3 text-gray-400">任意</span>
        </Button>
        <input
          id="community-photo"
          type="file"
          accept="image/*,image/heic,image/heif,.heic,.heif"
          className="hidden"
          onChange={event => {
            void addPhotos(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        {allPhotos.map(photo => (
          <div key={photo.key} className="relative">
            <Image
              src={photo.src}
              alt="追加した写真"
              width={64}
              height={64}
              unoptimized
              className="size-16 rounded-lg border border-gray-200 object-cover"
            />
            <Button
              type="button"
              variant="ghost"
              aria-label="写真を削除"
              className="absolute -top-1.5 -right-1.5 size-5 min-w-5 rounded-full border border-gray-200 bg-white p-0 text-gray-600 shadow-sm hover:bg-gray-50"
              onClick={photo.remove}
            >
              <X size={12} strokeWidth={2.5} />
            </Button>
          </div>
        ))}
      </div>
      {photoCount > MAX_PHOTOS && (
        <p role="alert" className="text-xs text-red-600">
          写真は1枚までです。不要な写真を削除するか、選び直してください。
        </p>
      )}
      <Field label="日時" required error={fieldError("日時")}>
        <div className="grid min-w-0 grid-cols-1 gap-1 @min-[21rem]/composer:grid-cols-[minmax(0,1fr)_6.5rem]">
          <div className="min-w-0 max-w-full overflow-hidden">
            <Input
              type="date"
              aria-label="日付"
              className={cn("h-8 min-w-0", styles.nativeDateTime)}
              max={today()}
              value={report.observedOn}
              onChange={event => {
                timeEdited.current = true;
                setReport(current => ({
                  ...current,
                  observedOn: event.target.value,
                }));
              }}
            />
          </div>
          <div className="min-w-0 max-w-full overflow-hidden">
            <Input
              type="time"
              aria-label="時刻"
              className={cn("h-8 min-w-0", styles.nativeDateTime)}
              value={report.observedTime ?? ""}
              onChange={event => {
                timeEdited.current = true;
                setReport(current => ({
                  ...current,
                  observedTime: event.target.value || null,
                }));
              }}
            />
          </div>
        </div>
        <div className="mt-1 flex justify-start">
          <Button
            type="button"
            variant="outline"
            aria-label="現在時刻を取得"
            className="h-8 shrink-0 px-2 text-xs whitespace-nowrap md:text-sm"
            onClick={() => {
              timeEdited.current = true;
              setReport(current => ({ ...current, ...currentTokyoDateTime() }));
            }}
          >
            <Clock3 size={14} />
            現在時刻を取得
          </Button>
        </div>
      </Field>
      <Field
        label="場所"
        required={isPointKind(entry.kind)}
        error={fieldError("場所")}
      >
        <div className="flex items-center gap-1.5">
          <div className="flex min-h-8 min-w-0 flex-1 items-center gap-1 rounded-lg border border-input px-1 py-0.5">
            <span
              title={
                hasLocation
                  ? `${entry.latitude?.toFixed(5)}, ${entry.longitude?.toFixed(5)}`
                  : undefined
              }
              className={cn(
                "min-w-0 flex-1 text-[11px] leading-3 tabular-nums break-words md:text-xs md:leading-3",
                hasLocation ? "text-gray-500" : "text-gray-400",
              )}
            >
              {hasLocation
                ? `${entry.latitude?.toFixed(5)}, ${entry.longitude?.toFixed(5)}`
                : "未指定"}
            </span>
            {hasLocation && !isPointKind(entry.kind) && (
              <Button
                type="button"
                variant="ghost"
                aria-label="場所を消す"
                className="size-5 min-w-5 shrink-0 rounded-full p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => {
                  locationEdited.current = true;
                  geoRequest.current++;
                  setLocating(false);
                  setLocationAccuracy(null);
                  patchEntry({ latitude: null, longitude: null });
                }}
              >
                <X size={14} />
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            aria-label="現在位置を取得"
            className="h-8 shrink-0 gap-1 px-1.5 text-xs whitespace-nowrap md:text-sm"
            disabled={locating}
            aria-busy={locating}
            onClick={acquireLocation}
          >
            {locating ? (
              <Spinner className="size-4" />
            ) : (
              <LocateFixed size={14} />
            )}
            現在位置を取得
          </Button>
        </div>
        {locating && (
          <p role="status" className="mt-1 text-xs text-gray-500">
            現在位置を取得中…
          </p>
        )}
        {locationAccuracy != null && locationAccuracy > 100 && (
          <p role="status" className="mt-1 text-xs text-amber-800">
            位置の精度は約{Math.round(locationAccuracy)}
            mです。地図で確認してください。
          </p>
        )}
        {!showErrors &&
          entry.longitude != null &&
          entry.latitude != null &&
          missing.場所 && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {missing.場所}
            </p>
          )}
        <p className="mt-1 text-[11px] text-gray-500">
          地図を長押しして場所を追加・変更
        </p>
      </Field>
      {entry.kind === "COURSE" && (
        <>
          <Field label="コース" required error={fieldError("コース")}>
            {targetSelect(false, false)}
          </Field>
          {statusField(COURSE_STATUSES)}
          {snowField}
          <Field label="混雑状況">
            <Chips
              label="混雑状況"
              values={CROWDING}
              selected={entry.crowding ? [entry.crowding] : []}
              onChange={([crowding]) =>
                patchEntry({ crowding: crowding ?? null })
              }
            />
          </Field>
        </>
      )}
      {entry.kind === "LIFT" && (
        <>
          <Field label="リフト" required error={fieldError("リフト")}>
            {targetSelect(true, false)}
          </Field>
          {statusField(LIFT_STATUSES)}
          <Field label="待ち時間">
            <div className="flex items-center gap-1.5 text-sm text-gray-700 md:text-base">
              <Input
                inputMode="numeric"
                aria-label="待ち時間（分）"
                placeholder="任意"
                className="h-8 w-16 placeholder:text-xs placeholder:text-gray-300"
                value={entry.waitMinutes ?? ""}
                onChange={event => {
                  const text = event.target.value;
                  if (!/^\d{0,3}$/.test(text)) return;
                  patchEntry({
                    waitMinutes:
                      text === "" ? null : Math.min(240, Number(text)),
                  });
                }}
              />
              分
            </div>
          </Field>
          <Field label="速度">
            <div className="space-y-1.5 text-sm text-gray-700 md:text-base">
              <Chips
                label="速度"
                values={LIFT_SPEED_LEVELS}
                selected={entry.liftSpeedLevel ? [entry.liftSpeedLevel] : []}
                onChange={([liftSpeedLevel]) =>
                  patchEntry({ liftSpeedLevel: liftSpeedLevel ?? null })
                }
              />
              {/* m/s と km/h のどちらを入れても、もう片方を換算して埋める */}
              <div className="flex items-center gap-1 whitespace-nowrap">
                <Input
                  inputMode="decimal"
                  aria-label="速度（m/s）"
                  placeholder="任意"
                  className="h-8 w-14 placeholder:text-xs placeholder:text-gray-300"
                  value={liftSpeedText}
                  onChange={event => {
                    const text = event.target.value;
                    if (!DECIMAL_1.test(text)) return;
                    const value = toSpeedNumber(text);
                    setLiftSpeedText(text);
                    setKmhText(value == null ? "" : (value * 3.6).toFixed(1));
                    patchEntry({ liftSpeed: value });
                  }}
                />
                m/s
                <span className="px-0.5 text-gray-400">=</span>
                <Input
                  inputMode="decimal"
                  aria-label="速度（km/h）"
                  placeholder="任意"
                  className="h-8 w-14 placeholder:text-xs placeholder:text-gray-300"
                  value={kmhText}
                  onChange={event => {
                    const text = event.target.value;
                    if (!DECIMAL_1.test(text)) return;
                    const value = toSpeedNumber(text);
                    const metres = value == null ? null : round1(value / 3.6);
                    setKmhText(text);
                    setLiftSpeedText(metres == null ? "" : metres.toFixed(1));
                    patchEntry({ liftSpeed: metres });
                  }}
                />
                km/h
              </div>
            </div>
          </Field>
        </>
      )}
      {isPointKind(entry.kind) && (
        <Field label="コース">{targetSelect(false, true)}</Field>
      )}
      {entry.kind === "ITEM" && (
        <>
          <Field label="アイテム" required error={fieldError("アイテム")}>
            <Chips
              label="アイテム"
              values={ITEM_TYPES}
              selected={entry.itemType ? [entry.itemType] : []}
              onChange={([itemType]) =>
                patchEntry({
                  itemType: itemType ?? null,
                  ...(itemType && SIZED_ITEM_TYPES.includes(itemType)
                    ? {}
                    : { size: null }),
                })
              }
            />
          </Field>
          {entry.itemType && SIZED_ITEM_TYPES.includes(entry.itemType) && (
            <Field label="サイズ">
              <Input
                aria-label="サイズ"
                className="h-8 placeholder:text-xs placeholder:text-gray-300"
                maxLength={100}
                placeholder="任意（例：5m）"
                value={entry.size ?? ""}
                onChange={event =>
                  patchEntry({ size: event.target.value || null })
                }
              />
            </Field>
          )}
        </>
      )}
      {isPointKind(entry.kind) && snowField}
      {entry.kind === "MOGUL" && (
        <Field label="深さ">
          <Chips
            label="深さ"
            values={MOGUL_DEPTHS}
            selected={entry.depth ? [entry.depth] : []}
            onChange={([depth]) => patchEntry({ depth: depth ?? null })}
          />
        </Field>
      )}
      <Field label="自由記述">
        <Textarea
          aria-label="自由記述"
          className="min-h-20 text-sm md:text-base"
          maxLength={4000}
          value={entry.body}
          onChange={event => patchEntry({ body: event.target.value })}
        />
      </Field>
    </div>
  );

  const footer = (
    <div className="shrink-0 space-y-1.5 border-t border-gray-200 p-3 md:px-4">
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {previewOnly && (
        <p role="status" className="text-xs text-amber-700">
          プレビュー中（送信できません）
        </p>
      )}
      <Button
        className="h-9 w-full"
        disabled={busy || processingPhotos || locating}
        onClick={save}
      >
        {busy ? "送信中…" : editingPostId ? "更新する" : "投稿する"}
      </Button>
    </div>
  );

  return shell(ENTRY_KINDS[entry.kind], form, footer);
}
