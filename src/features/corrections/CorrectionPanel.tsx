"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
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
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/shared/components/LoadingSpinner";
import { PanelHeader } from "@/shared/components/PanelHeader";
import { getCorrectionFeatures, submitCorrection } from "./actions";
import { withAnonymousCheck } from "./anonymousCheck";
import { CorrectionMap } from "./CorrectionMap";
import type { CorrectionTarget } from "./correctionEvents";
import {
  buildCorrection,
  type CorrectionFeature,
  type CorrectionKind,
  clearEdit,
  correctionAvailability,
  type Mark,
  type PropEdits,
  setEdit,
} from "./model";
import { type BulkField, BulkScreen } from "./panel/BulkScreen";
import { DetailsScreen, FeatureForm } from "./panel/DetailsScreen";
import {
  type Evidence,
  EvidenceFields,
  emptyEvidence,
  evidenceUrls,
  releaseEvidence,
} from "./panel/EvidenceFields";
import { GeometryScreen } from "./panel/GeometryScreen";
import { useGeometryEditor } from "./panel/useGeometryEditor";

/** 1本の線を指す。地図での選択と、一覧で開いている行をそろえるのに使う */
export type CorrectionLineRef = { kind: CorrectionKind; id: string };
/**
 * スマホでの地図とパネルの分け方。
 * form は入力が主役、map-list は地図と一覧を半々、map-tools は地図を広く使う。
 */
export type CorrectionLayout = "form" | "map-list" | "map-tools";

type Screen =
  | { type: "menu"; scope: "target" | "all" }
  | { type: "geometry"; kind: CorrectionKind; scopeIds?: string[] }
  | { type: "details"; kind: CorrectionKind; scopeIds?: string[] }
  | { type: "bulk"; field: BulkField }
  | { type: "other" }
  | { type: "confirm" }
  | { type: "done" };

type Props = {
  resortId: string;
  center: [number, number];
  /** コース・リフトの詳細から開いたときの対象 */
  target?: CorrectionTarget;
  /** スマホ。地図の下の狭いパネルに出す */
  compact: boolean;
  /** 位置を直すときの地図を出す場所。用意できるまで null */
  mapHost: HTMLElement | null;
  /** いつもの地図で選ばれた線。詳細・一括の画面で、その行を開く */
  selectedLine: CorrectionLineRef | null;
  /** 一覧で開いた線を、いつもの地図でも選択する */
  onSelectedLineChange: (line: CorrectionLineRef | null) => void;
  onLayoutChange: (layout: CorrectionLayout) => void;
  onClose: () => void;
};

const KIND_LABEL = { slope: "コース", lift: "リフト" } as const;
const BULK_LABEL: Record<BulkField, string> = {
  piste: "圧雪情報",
  morning: "早朝営業情報",
  night: "ナイター営業情報",
};
const MAX_ITEMS = 200;

function Shell({
  title,
  onBack,
  onClose,
  closeDisabled,
  footer,
  scroll = true,
  children,
}: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
  closeDisabled?: boolean;
  footer?: ReactNode;
  /** 本文を自分でスクロールさせる画面（上に固定する帯がある）では false */
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="情報の修正パネル"
      className="@container/correction flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-white"
    >
      <PanelHeader
        title={title}
        onBack={onBack}
        onClose={onClose}
        closeLabel="修正を閉じる"
        closeDisabled={closeDisabled}
      />
      {scroll ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          {children}
        </div>
      ) : (
        children
      )}
      {footer}
    </section>
  );
}

/**
 * 詳細パネルの中で開く「情報を修正」。
 * 何を直すかを選び、直した内容をまとめて送信する。送信した内容は公開されず、
 * 管理者が確認してから反映される。
 */
export function CorrectionPanel(props: Props) {
  const { resortId, onClose, onLayoutChange } = props;
  const [load, setLoad] = useState<
    | { state: "loading" }
    | { state: "error"; message: string }
    | { state: "ready"; features: CorrectionFeature[] }
  >({ state: "loading" });
  useEffect(() => {
    let alive = true;
    setLoad({ state: "loading" });
    getCorrectionFeatures(resortId)
      .then(result => {
        if (!alive) return;
        setLoad(
          result.ok
            ? { state: "ready", features: result.features }
            : { state: "error", message: result.error },
        );
      })
      .catch(() => {
        if (alive)
          setLoad({
            state: "error",
            message: "現在の登録内容を読み込めませんでした。",
          });
      });
    return () => {
      alive = false;
    };
  }, [resortId]);
  const ready = load.state === "ready";
  useEffect(() => {
    if (!ready) onLayoutChange("form");
  }, [onLayoutChange, ready]);

  if (load.state !== "ready")
    return (
      <Shell title="情報を修正" onClose={onClose}>
        {load.state === "error" ? (
          <p className="p-3 text-sm text-gray-700 md:p-4">{load.message}</p>
        ) : (
          <LoadingSpinner className="h-full bg-white" />
        )}
      </Shell>
    );
  return <Workspace {...props} features={load.features} />;
}

function Workspace({
  resortId,
  center,
  target,
  compact,
  mapHost,
  selectedLine,
  onSelectedLineChange,
  onLayoutChange,
  onClose,
  features,
}: Props & { features: CorrectionFeature[] }) {
  // 詳細から渡された線のうち、正本に実在するものだけを対象にする
  const targetIds = useMemo(
    () =>
      target
        ? target.ids.filter(id =>
            features.some(
              feature => feature.id === id && feature.kind === target.kind,
            ),
          )
        : [],
    [features, target],
  );
  const targetKind = target?.kind ?? "slope";
  const hasTarget = targetIds.length > 0;
  const [stack, setStack] = useState<Screen[]>([
    { type: "menu", scope: hasTarget ? "target" : "all" },
  ]);
  const screen = stack.at(-1) ?? { type: "menu", scope: "all" };
  const push = (next: Screen) => setStack(current => [...current, next]);
  const back =
    stack.length > 1 ? () => setStack(s => s.slice(0, -1)) : undefined;

  const editor = useGeometryEditor(features);
  const [edits, setEdits] = useState<PropEdits>({});
  const [otherText, setOtherText] = useState("");
  const [evidence, setEvidence] = useState<Evidence>(emptyEvidence);
  const evidenceRef = useRef(evidence);
  evidenceRef.current = evidence;
  useEffect(() => () => releaseEvidence(evidenceRef.current), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(1);
  const [focusKey, setFocusKey] = useState(0);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, startTransition] = useTransition();
  const operationKey = useRef(crypto.randomUUID());

  const { items, summary } = useMemo(
    () => buildCorrection({ features, lines: editor.lines, edits, otherText }),
    [edits, editor.lines, features, otherText],
  );
  const count = summary.length;
  const availability = useMemo(
    () => correctionAvailability(features),
    [features],
  );
  const dirty =
    count > 0 ||
    evidence.photos.length > 0 ||
    evidence.comment.trim() !== "" ||
    evidence.urls.some(url => url.trim());

  // --- 画面ごとの、地図とパネルの分け方 -----------------------------------
  const geometry = screen.type === "geometry" ? screen : null;
  const layout: CorrectionLayout = geometry
    ? (editor.active && editor.mode === "draw") ||
      geometry.scopeIds?.length === 1
      ? "map-tools"
      : "map-list"
    : "form";
  useEffect(() => onLayoutChange(layout), [layout, onLayoutChange]);

  // --- いつもの地図の選択と、開いている行をそろえる -----------------------
  const details = screen.type === "details" ? screen : null;
  const detailsKind = details?.kind;
  // 詳細では開いている行の線を、対象を絞ったメニューではその対象を地図で選んだままにする
  const targetMenu = screen.type === "menu" && screen.scope === "target";
  const syncKind = details ? detailsKind : targetMenu ? targetKind : undefined;
  const syncId = details ? openId : targetMenu ? (targetIds[0] ?? null) : null;
  const lineSync = useRef(onSelectedLineChange);
  lineSync.current = onSelectedLineChange;
  useEffect(() => {
    lineSync.current(
      syncKind && syncId ? { kind: syncKind, id: syncId } : null,
    );
  }, [syncId, syncKind]);
  const selectedKind = selectedLine?.kind;
  const selectedId = selectedLine?.id;
  const detailsScope = details?.scopeIds;
  useEffect(() => {
    if (!selectedId || selectedKind !== detailsKind) return;
    if (detailsScope && !detailsScope.includes(selectedId)) return;
    if (features.some(feature => feature.id === selectedId))
      setOpenId(selectedId);
  }, [detailsKind, detailsScope, features, selectedId, selectedKind]);

  const openGeometry = (kind: CorrectionKind, scopeIds?: string[]) => {
    setError("");
    editor.select(scopeIds?.length === 1 ? (scopeIds[0] ?? null) : null);
    // 1本だけ直すときはその線へ、それ以外はスキー場全体が入る位置へ寄せる
    if (scopeIds?.length === 1) setFocusKey(key => key + 1);
    else setFitKey(key => key + 1);
    push({ type: "geometry", kind, scopeIds });
  };
  const openDetails = (kind: CorrectionKind, scopeIds?: string[]) => {
    setError("");
    setOpenId(scopeIds?.[0] ?? null);
    push({ type: "details", kind, scopeIds });
  };
  const handleEdit = (
    feature: CorrectionFeature,
    field: string,
    value: unknown,
  ) => setEdits(current => setEdit(current, feature, field, value));
  const handleReset = (feature: CorrectionFeature, field: string) =>
    setEdits(current => clearEdit(current, feature.id, field));
  const handleEditAll = (
    list: CorrectionFeature[],
    field: string,
    value: Mark,
  ) =>
    setEdits(current =>
      list.reduce(
        (next, feature) => setEdit(next, feature, field, value),
        current,
      ),
    );

  const requestClose = () => {
    if (dirty && screen.type !== "done") setConfirmClose(true);
    else onClose();
  };

  const submit = () =>
    startTransition(async () => {
      if (!items.length) {
        setError("修正する内容を入力してください。");
        return;
      }
      if (items.length > MAX_ITEMS) {
        setError(
          `一度に送信できる修正は${MAX_ITEMS}件までです。分けて送信してください。`,
        );
        return;
      }
      const references = evidenceUrls(evidence);
      if (references.error) {
        setError(references.error);
        return;
      }
      const photos = new FormData();
      for (const photo of evidence.photos) photos.append("photos", photo.file);
      try {
        const result = await withAnonymousCheck(proof =>
          submitCorrection(
            {
              resortId,
              operationKey: operationKey.current,
              proof,
              context: {
                source: "detail-panel",
                ...(hasTarget ? { targetKind, targetIds } : {}),
              },
              returnTo: `/${resortId}`,
              items,
              comment: evidence.comment.trim() || undefined,
              evidenceUrls: references.urls.length
                ? references.urls
                : undefined,
            },
            photos,
          ),
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } catch {
        setError(
          "送信できませんでした。通信状況を確認して、もう一度お試しください。",
        );
        return;
      }
      // 続けて別の修正を送れるよう、入力を空に戻す
      operationKey.current = crypto.randomUUID();
      releaseEvidence(evidence);
      setEvidence(emptyEvidence());
      setEdits({});
      setOtherText("");
      setOpenId(null);
      editor.reset(features);
      setError("");
      setStack([{ type: "done" }]);
    });

  const errorLine = error && (
    <p role="alert" className="text-sm text-red-700">
      {error}
    </p>
  );
  const nextFooter = (
    <div className="shrink-0 space-y-1.5 border-t border-gray-200 p-3 md:px-4">
      {errorLine}
      <Button
        className="h-9 w-full"
        disabled={count === 0}
        onClick={() => {
          setError("");
          push({ type: "confirm" });
        }}
      >
        {count > 0 ? `次へ（修正 ${count}件）` : "次へ"}
      </Button>
    </div>
  );
  const submitFooter = (
    <div className="shrink-0 space-y-1.5 border-t border-gray-200 p-3 md:px-4">
      {errorLine}
      <Button
        className="h-9 w-full"
        disabled={busy || count === 0}
        onClick={submit}
      >
        {busy ? "送信中…" : "送信する"}
      </Button>
    </div>
  );

  const closeDialog = (
    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent overlayClassName="z-[900]" className="z-[901]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            入力した修正を破棄して閉じますか？
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>入力に戻る</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onClose}>
            破棄して閉じる
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const shell = (
    title: string,
    body: ReactNode,
    options: { footer?: ReactNode; scroll?: boolean } = {},
  ) => (
    <>
      <Shell
        title={title}
        onBack={screen.type === "done" ? undefined : back}
        onClose={requestClose}
        closeDisabled={busy}
        footer={options.footer}
        scroll={options.scroll}
      >
        {body}
      </Shell>
      {closeDialog}
    </>
  );

  // --- メニュー -----------------------------------------------------------
  const verb = (registered: boolean) => (registered ? "修正" : "追加");
  const menuButton = (label: string, onClick: () => void) => (
    <Button
      key={label}
      type="button"
      variant="outline"
      // いちばん長い「ナイター営業情報の修正」が、狭いパネルの2列でも1行に収まる大きさ
      className="h-12 min-w-0 px-1 text-[clamp(12px,3.9cqw,14px)] font-semibold text-gray-800"
      onClick={onClick}
    >
      {label}
    </Button>
  );

  if (screen.type === "menu" && screen.scope === "target" && hasTarget) {
    const label = KIND_LABEL[targetKind];
    const name =
      target?.name ??
      features.find(feature => feature.id === targetIds[0])?.name ??
      label;
    return shell(
      "情報を修正",
      <div className="space-y-2 p-3 md:p-4">
        <p className="text-sm font-bold break-words text-gray-900">{name}</p>
        <div className="grid gap-2">
          {menuButton(`この${label}の位置の修正`, () =>
            openGeometry(targetKind, targetIds),
          )}
          {menuButton(`この${label}の詳細の修正`, () =>
            openDetails(targetKind, targetIds),
          )}
          {menuButton(`他の${label}もまとめて修正`, () =>
            push({ type: "menu", scope: "all" }),
          )}
        </div>
      </div>,
      { footer: count > 0 ? nextFooter : undefined },
    );
  }

  if (screen.type === "menu")
    return shell(
      "情報を修正",
      <div className="space-y-2 p-3 md:p-4">
        <p className="text-sm text-gray-600">何を修正しますか？</p>
        <div className="grid grid-cols-2 gap-2">
          {menuButton(
            `コースの位置を${verb(availability.slopeCount > 0)}`,
            () => openGeometry("slope"),
          )}
          {menuButton(`リフトの位置を${verb(availability.liftCount > 0)}`, () =>
            openGeometry("lift"),
          )}
          {menuButton(`コースの詳細の${verb(availability.slopeDetails)}`, () =>
            openDetails("slope"),
          )}
          {menuButton(`リフトの詳細の${verb(availability.liftDetails)}`, () =>
            openDetails("lift"),
          )}
          {(["piste", "morning", "night"] as const).map(field =>
            menuButton(
              `${BULK_LABEL[field]}の${verb(availability[field])}`,
              () => {
                setError("");
                push({ type: "bulk", field });
              },
            ),
          )}
          {menuButton("その他の修正", () => {
            setError("");
            push({ type: "other" });
          })}
        </div>
      </div>,
      { footer: count > 0 ? nextFooter : undefined },
    );

  // --- 位置 ---------------------------------------------------------------
  if (screen.type === "geometry") {
    const label = KIND_LABEL[screen.kind];
    const registered =
      screen.kind === "slope"
        ? availability.slopeCount > 0
        : availability.liftCount > 0;
    return (
      <>
        {shell(
          screen.scopeIds
            ? `この${label}の位置の修正`
            : `${label}の位置を${verb(registered)}`,
          <GeometryScreen
            kind={screen.kind}
            editor={editor}
            features={features}
            scopeIds={screen.scopeIds}
            compact={compact}
            onSelectFromList={id => {
              editor.select(id);
              setFocusKey(key => key + 1);
            }}
          />,
          { footer: nextFooter, scroll: false },
        )}
        {mapHost &&
          createPortal(
            <CorrectionMap
              center={center}
              kind={screen.kind}
              editor={editor}
              scopeIds={screen.scopeIds}
              compact={compact}
              fitKey={fitKey}
              focusKey={focusKey}
            />,
            mapHost,
          )}
      </>
    );
  }

  // --- 詳細 ---------------------------------------------------------------
  if (screen.type === "details") {
    const label = KIND_LABEL[screen.kind];
    const scoped = screen.scopeIds
      ? features.filter(feature => screen.scopeIds?.includes(feature.id))
      : features;
    const only = screen.scopeIds?.length === 1 ? scoped[0] : undefined;
    const registered =
      screen.kind === "slope"
        ? availability.slopeDetails
        : availability.liftDetails;
    return shell(
      screen.scopeIds
        ? `この${label}の詳細の修正`
        : `${label}の詳細の${verb(registered)}`,
      only ? (
        <div className="p-3 md:p-4">
          <FeatureForm
            feature={only}
            edits={edits}
            onEdit={handleEdit}
            onReset={handleReset}
          />
        </div>
      ) : (
        <DetailsScreen
          kind={screen.kind}
          features={scoped}
          edits={edits}
          onEdit={handleEdit}
          onReset={handleReset}
          openId={openId}
          onOpenChange={setOpenId}
          onAddPosition={() => openGeometry(screen.kind)}
        />
      ),
      { footer: nextFooter },
    );
  }

  // --- まとめて修正 -------------------------------------------------------
  if (screen.type === "bulk")
    return shell(
      `${BULK_LABEL[screen.field]}の${verb(availability[screen.field])}`,
      <BulkScreen
        field={screen.field}
        features={features}
        edits={edits}
        onEdit={handleEdit}
        onSelect={feature =>
          onSelectedLineChange({ kind: feature.kind, id: feature.id })
        }
        onEditAll={handleEditAll}
        onReset={handleReset}
        focusId={selectedLine?.id ?? null}
        onAddPosition={() => openGeometry("slope")}
      />,
      { footer: nextFooter },
    );

  // --- その他（自由記述） -------------------------------------------------
  if (screen.type === "other")
    return shell(
      "その他の修正",
      <div className="space-y-3 p-3 md:p-4">
        <p className="text-sm text-gray-600">
          誤っている内容と、正しい内容を書いてください。
        </p>
        <Textarea
          aria-label="誤っている内容"
          className="min-h-28 text-sm md:text-base"
          maxLength={4000}
          value={otherText}
          onChange={event => setOtherText(event.target.value)}
        />
        <EvidenceFields
          value={evidence}
          onChange={setEvidence}
          onError={setError}
          showComment={false}
        />
        {count - (otherText.trim() ? 1 : 0) > 0 && (
          <p className="text-xs text-gray-500">
            ほかに入力済みの修正 {count - (otherText.trim() ? 1 : 0)}
            件も一緒に送信します。
          </p>
        )}
      </div>,
      { footer: submitFooter },
    );

  // --- 送信前の確認 -------------------------------------------------------
  if (screen.type === "confirm")
    return shell(
      "送信前の確認",
      <div className="space-y-3 p-3 md:p-4">
        <section aria-label="修正する内容">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">
            修正する内容（{count}件）
          </h3>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {summary.map(row => (
              <li key={row.key} className="px-2.5 py-1.5 text-sm">
                <span className="font-semibold text-gray-900">
                  {row.target}
                </span>
                <span className="ml-2 break-words whitespace-pre-wrap text-gray-700">
                  {row.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="修正の根拠" className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              根拠になる写真・URL
            </h3>
            <p className="text-xs text-gray-500">
              公式サイトのページや現地の写真があると確認が早くなります。単純な誤りなら空欄のまま送信できます。
            </p>
          </div>
          <EvidenceFields
            value={evidence}
            onChange={setEvidence}
            onError={setError}
          />
        </section>
      </div>,
      { footer: submitFooter },
    );

  // --- 完了 ---------------------------------------------------------------
  return shell(
    "情報を修正",
    <div className="space-y-3 p-3 md:p-4">
      <div>
        <p className="text-base font-semibold text-gray-900 md:text-lg">
          ありがとうございます
        </p>
        <p className="mt-1 text-sm text-gray-700">
          管理者が確認し、間違いがなければ反映します。
        </p>
      </div>
      <Button
        variant="outline"
        className="w-full"
        onClick={() =>
          setStack([{ type: "menu", scope: hasTarget ? "target" : "all" }])
        }
      >
        続けて修正する
      </Button>
      <Button className="w-full" onClick={onClose}>
        戻る
      </Button>
    </div>,
  );
}
