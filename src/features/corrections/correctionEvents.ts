export const CORRECTION_EVENT = "rusutsu:correction-open";
/** 修正パネルを開いている間、スマホの上部見出し（スキー場名）を隠すための通知 */
export const CORRECTION_STATE_EVENT = "rusutsu:correction-state";

export function setCorrectionActive(resortId: string, active: boolean) {
  window.dispatchEvent(
    new CustomEvent(CORRECTION_STATE_EVENT, { detail: { resortId, active } }),
  );
}

/**
 * コース・リフトの詳細から開いたときの対象。未指定ならスキー場全体の修正。
 * 上部・下部などに分かれたコースは、同じまとまりの線をすべて ids に入れる。
 */
export type CorrectionTarget = {
  kind: "slope" | "lift";
  ids: string[];
  /** 詳細に出している名前。無ければ線の登録名を使う */
  name?: string;
};
export type CorrectionRequest = {
  resortId: string;
  target?: CorrectionTarget;
};

/**
 * 開いているスキー場詳細が、その場で修正パネルに切り替える。
 * 詳細が無い画面（比較など）では false を返すので、呼び出し側は
 * correctionUrl へ移動して同じパネルを開く。
 */
export function requestCorrection(request: CorrectionRequest) {
  return !window.dispatchEvent(
    new CustomEvent(CORRECTION_EVENT, { detail: request, cancelable: true }),
  );
}

export function correctionUrl(request: CorrectionRequest) {
  const query = new URLSearchParams({ correct: "1" });
  if (request.target?.ids.length)
    query.set(
      request.target.kind === "slope" ? "correctCourse" : "correctLift",
      request.target.ids.join(","),
    );
  return `/${encodeURIComponent(request.resortId)}?${query}`;
}

export const CORRECTION_QUERY_KEYS = [
  "correct",
  "correctCourse",
  "correctLift",
] as const;

export function correctionRequestFromUrl(
  resortId: string,
  url: URL,
): CorrectionRequest | null {
  if (url.searchParams.get("correct") !== "1") return null;
  const ids = (key: string) =>
    (url.searchParams.get(key) ?? "").split(",").filter(Boolean);
  const courses = ids("correctCourse");
  const lifts = ids("correctLift");
  return {
    resortId,
    target: courses.length
      ? { kind: "slope", ids: courses }
      : lifts.length
        ? { kind: "lift", ids: lifts }
        : undefined,
  };
}
