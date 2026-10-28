"use client";

import {
  Camera,
  Check,
  ChevronLeft,
  Minus,
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
import { rememberCommunityPost } from "./CommunityMapOverlay";
import { onLoginWindowDone, openLoginWindow } from "./LoginWindow";
import { nearestCourseId } from "./location";
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
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 48 * 1024 * 1024;

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
        {label}
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
  const [pickingPoint, setPickingPoint] = useState(false);
  // 「2.」のような入力途中の文字を残すため、数値とは別に持つ。
  const [liftSpeedText, setLiftSpeedText] = useState("");
  const [kmhText, setKmhText] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, startTransition] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());
  const timeEdited = useRef(false);
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
  }
  const fieldError = (label: string) =>
    showErrors ? missing[label] : undefined;
  const visibleSavedPhotos = savedPhotos.filter(
    photo => !removedPhotoIds.includes(photo.id),
  );
  const photoCount = visibleSavedPhotos.length + newPhotos.length;

  useEffect(
    () => () => {
      for (const photo of newPhotosRef.current) URL.revokeObjectURL(photo.url);
      callbacks.current.onMapPickModeChange?.(null);
      callbacks.current.onMapPointChange?.(null);
    },
    [],
  );

  // ログインしているかはブラウザが持つセッションで先に分かるので、
  // 未ログインならサーバーに問い合わせずにログインの案内を出す。
  const { status: sessionStatus, update: refreshSession } = useSession();
  // 別ウィンドウでログインしたら、ログイン状態だけ読み直して入力画面へ進む
  useEffect(
    () => onLoginWindowDone(() => void refreshSession()),
    [refreshSession],
  );
  const signedOut = sessionStatus === "unauthenticated";
  useEffect(() => {
    if (sessionStatus === "loading") return;
    let alive = true;
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
        )
          initial.entries = [
            {
              ...blankEntry(target.kind),
              ...(target.kind === "COURSE"
                ? { courseId: target.id }
                : { liftId: target.id }),
            },
          ];
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
          setSavedPhotos(post.entries[0]?.photos ?? []);
          setVersion(post.version);
        }
        setReport(initial);
        setStep(
          !account?.publicName && !canPreview
            ? "profile"
            : initial.entries.length
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
  }, [allowPreview, resortId, postId, sessionStatus, signedOut]);

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
  const startEntry = useCallback((kind: Kind, patch = {}) => {
    setReport(current => ({
      ...current,
      entries: [{ ...blankEntry(kind), ...patch }],
    }));
    setStep("edit");
  }, []);

  // 地点が決まったら、コース・リフトの項目は未選択のときだけ近いものを選ぶ。
  // コブ・アイテムのコースは地点に付随する情報なので、地点に合わせて選び直す。
  const applyPoint = useCallback(
    (point: [number, number], courseId?: string | null) => {
      const current = reportRef.current.entries[0];
      if (!current) return;
      const patch: Partial<ReportEntryDraft> = {
        longitude: point[0],
        latitude: point[1],
      };
      if (isPointKind(current.kind))
        patch.courseId = courseId ?? nearestCourseId(point, mapData.courses);
      else if (current.kind === "COURSE" && !current.courseId)
        patch.courseId = courseId ?? nearestCourseId(point, mapData.courses);
      else if (current.kind === "LIFT" && !current.liftId)
        patch.liftId = nearestCourseId(point, mapData.lifts);
      patchEntry(patch);
    },
    [mapData, patchEntry],
  );

  const applyMapTarget = useCallback(
    (target: ReportMapTarget) => {
      const current = reportRef.current.entries[0];
      if (target.kind === "POINT") {
        if (!current) return;
        applyPoint(target.coordinates, target.courseId);
        setPickingPoint(false);
        return;
      }
      if (!current) {
        startEntry(
          target.kind,
          target.kind === "COURSE"
            ? { courseId: target.id }
            : { liftId: target.id },
        );
        return;
      }
      if (current.kind === target.kind)
        patchEntry(
          target.kind === "COURSE"
            ? { courseId: target.id }
            : { liftId: target.id },
        );
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
  const editBaseline = useRef("");
  useEffect(() => {
    if (step === "edit" && entryKey)
      editBaseline.current = JSON.stringify(reportRef.current);
  }, [entryKey, step]);
  useEffect(() => {
    const current = reportRef.current.entries.find(
      item => item.clientKey === entryKey,
    );
    const speed = current?.liftSpeed;
    setLiftSpeedText(speed?.toString() ?? "");
    setKmhText(speed == null ? "" : (speed * 3.6).toFixed(1));
    setShowErrors(false);
  }, [entryKey]);

  const pointMode =
    step === "edit" && !!entry && (isPointKind(entry.kind) || pickingPoint);
  useEffect(() => {
    onMapPickModeChange?.(pointMode ? "POINT" : null);
  }, [onMapPickModeChange, pointMode]);
  useEffect(() => {
    onMapPointChange?.(
      step === "edit" && entry?.latitude != null && entry.longitude != null
        ? [entry.longitude, entry.latitude]
        : null,
    );
  }, [entry?.latitude, entry?.longitude, onMapPointChange, step]);
  // コブ・アイテムのコースは地点から決まるので、地図の選択は動かさない。
  const featureTarget =
    step !== "edit"
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
    clearNewPhotos();
    setSavedPhotos([]);
    setRemovedPhotoIds([]);
    setEditingPostId(null);
    setVersion(null);
    setReport(blankReport());
    setPickingPoint(false);
    setError("");
    timeEdited.current = false;
    idempotencyKey.current = crypto.randomUUID();
    setStep("choose");
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || processingPhotos) return;
    const selected = [...files];
    if (selected.some(file => file.size > MAX_PHOTO_BYTES)) {
      setError("写真は1枚8MB以下にしてください。");
      return;
    }
    const totalBytes = [...newPhotos.map(photo => photo.file), ...selected]
      .map(file => file.size)
      .reduce((sum, size) => sum + size, 0);
    if (
      photoCount + selected.length > MAX_PHOTOS ||
      totalBytes > MAX_TOTAL_BYTES
    ) {
      setError("写真は合計6枚、合計48MBまでです。");
      return;
    }
    const entryKey = reportRef.current.entries[0]?.clientKey;
    setProcessingPhotos(true);
    setError("");
    try {
      const accepted: { file: File; url: string }[] = [];
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
      if (reportRef.current.entries[0]?.clientKey !== entryKey) {
        for (const photo of accepted) URL.revokeObjectURL(photo.url);
        return;
      }
      setNewPhotos(current => [...current, ...accepted]);
      if (takenAt && !timeEdited.current) {
        timeEdited.current = true;
        const { observedOn, observedTime } = takenAt;
        setReport(current => ({ ...current, observedOn, observedTime }));
      }
      const current = reportRef.current.entries[0];
      if (gps && current && current.latitude == null) applyPoint(gps);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "写真を準備できませんでした。",
      );
    } finally {
      setProcessingPhotos(false);
    }
  };

  const save = () => {
    if (processingPhotos || !entry) return;
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
        setError(result.error);
        return;
      }
      setError("");
      rememberCommunityPost(resortId);
      setStep("done");
    });
  };

  const close = () => {
    onMapPickModeChange?.(null);
    onMapPointChange?.(null);
    onClose?.();
  };
  // 入力を始めた時点の内容と比べ、写真の追加・削除か入力の変更があれば確かめる
  const requestClose = () => {
    const dirty =
      step === "edit" &&
      (newPhotos.length > 0 ||
        removedPhotoIds.length > 0 ||
        JSON.stringify(report) !== editBaseline.current);
    if (dirty) setConfirmClose(true);
    else close();
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
      {embedded && onClose && (
        <Button
          type="button"
          aria-label="投稿を閉じる"
          variant="ghost"
          className="flex size-7 min-h-7 shrink-0 items-center justify-center rounded-full border border-gray-200 p-0 text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-900 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/10 md:size-8 md:min-h-8"
          onClick={requestClose}
        >
          <X size={18} strokeWidth={2.5} />
        </Button>
      )}
    </div>
  );
  const shell = (title: string, body: ReactNode, footer?: ReactNode) => (
    <main
      className={cn(
        "flex min-h-0 flex-col bg-white",
        embedded ? "h-full" : "h-dvh",
      )}
    >
      {header(
        title,
        step === "edit" && !editingPostId
          ? () => {
              clearNewPhotos();
              setPickingPoint(false);
              setError("");
              setReport(current => ({ ...current, entries: [] }));
              setStep("choose");
            }
          : undefined,
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      {footer}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent overlayClassName="z-[900]" className="z-[901]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              入力した内容は消えますが、閉じますか？
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>入力に戻る</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmClose(false);
                close();
              }}
            >
              閉じる
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );

  if (step === "loading")
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

  // コース・リフトは地図のタップで選ぶ。場所はボタンで地点の指定に切り替える。
  const pointButton = (
    <Button
      type="button"
      variant="outline"
      aria-pressed={pickingPoint}
      className={cn(
        "h-8 shrink-0 px-2 text-xs md:text-sm",
        pickingPoint && chipClass(true),
        pickingPoint && "h-8 md:text-sm",
      )}
      onClick={() => setPickingPoint(current => !current)}
    >
      地図で選ぶ
    </Button>
  );
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
          onValueChange={next =>
            patchEntry(
              lift ? { liftId: next || null } : { courseId: next || null },
            )
          }
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
    <div className="space-y-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-16 w-16 flex-col gap-0 px-0 text-[11px] text-gray-600"
          disabled={processingPhotos || photoCount >= MAX_PHOTOS}
          onClick={() => document.getElementById("community-photo")?.click()}
        >
          {processingPhotos ? (
            <Spinner className="size-5" />
          ) : (
            <Camera className="size-5" />
          )}
          写真を追加
          <span className="text-[10px] leading-3 text-gray-400">任意</span>
        </Button>
        <input
          id="community-photo"
          type="file"
          accept="image/*,image/heic,image/heif,.heic,.heif"
          multiple
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
      <Field label="日時" required error={fieldError("日時")}>
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-1.5">
          <Input
            type="date"
            aria-label="日付"
            className="h-8 min-w-0"
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
          <Input
            type="time"
            aria-label="時刻"
            className="h-8 min-w-0"
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
      </Field>
      <Field
        label="場所"
        required={isPointKind(entry.kind)}
        error={fieldError("場所")}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "flex h-8 min-w-0 flex-1 items-center gap-1 rounded-lg border border-gray-200 px-2 text-xs tabular-nums md:text-sm",
              hasLocation ? "text-gray-700" : "text-gray-400",
            )}
          >
            <span className="min-w-0 truncate">
              {hasLocation
                ? `${entry.latitude?.toFixed(5)}, ${entry.longitude?.toFixed(5)}`
                : pointMode
                  ? "地図で指定"
                  : "未指定"}
            </span>
            {hasLocation && !isPointKind(entry.kind) && (
              <button
                type="button"
                aria-label="場所を消す"
                className="ml-auto shrink-0 text-gray-400 hover:text-gray-700"
                onClick={() => patchEntry({ latitude: null, longitude: null })}
              >
                <X size={14} />
              </button>
            )}
          </span>
          {!isPointKind(entry.kind) && pointButton}
        </div>
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
        disabled={busy || processingPhotos}
        onClick={save}
      >
        {busy ? "送信中…" : editingPostId ? "更新する" : "投稿する"}
      </Button>
    </div>
  );

  return shell(ENTRY_KINDS[entry.kind], form, footer);
}
