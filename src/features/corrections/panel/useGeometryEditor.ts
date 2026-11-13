import { useMemo, useReducer } from "react";
import {
  type CorrectionFeature,
  type CorrectionKind,
  type CorrectionLine,
  linesFromFeatures,
} from "../model";

type LngLat = [number, number];
export type GeometryMode = "view" | "edit" | "draw";

const HISTORY_LIMIT = 60;

type State = {
  lines: CorrectionLine[];
  history: CorrectionLine[][];
  future: CorrectionLine[][];
  activeId: string | null;
  mode: GeometryMode;
  /** 直前の操作。同じ点の移動や名前の入力は、1回分の「元に戻す」にまとめる */
  lastOperation: string | null;
};

type Action =
  | { type: "select"; id: string | null }
  | { type: "startNew"; kind: CorrectionKind; id: string }
  | { type: "finishDraw" }
  | { type: "continueDraw" }
  | {
      type: "coordinates";
      update: (
        coordinates: LngLat[],
        line: CorrectionLine,
        mode: GeometryMode,
      ) => LngLat[] | null;
      operation?: string;
    }
  | { type: "rename"; id: string; name: string }
  | { type: "remove"; id: string }
  | { type: "restore"; id: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; lines: CorrectionLine[] };

const initialState = (lines: CorrectionLine[]): State => ({
  lines,
  history: [],
  future: [],
  activeId: null,
  mode: "view",
  lastOperation: null,
});

const commit = (
  state: State,
  lines: CorrectionLine[],
  operation: string | null = null,
): State => {
  const merge = operation !== null && state.lastOperation === operation;
  return {
    ...state,
    lines,
    lastOperation: operation,
    history: merge
      ? state.history
      : [...state.history.slice(-(HISTORY_LIMIT - 1)), state.lines],
    future: merge ? state.future : [],
  };
};

/** 描きかけ（2点未満）の新しい線は、ほかの操作へ移るときに捨てる */
const dropUnfinished = (lines: CorrectionLine[], keepId?: string | null) =>
  lines.filter(
    line => !line.isNew || line.coordinates.length >= 2 || line.id === keepId,
  );

/** 元に戻す・やり直すで、選んでいた線が無くなったら選択を外す */
const keepSelection = (state: State): State => {
  const active = state.lines.find(
    line => line.id === state.activeId && !line.deleted,
  );
  if (!active) return { ...state, activeId: null, mode: "view" };
  // 描き終えた線が0〜1点に戻ったら、続きを描ける状態にする
  return active.coordinates.length < 2 ? { ...state, mode: "draw" } : state;
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "select": {
      const lines = dropUnfinished(state.lines, action.id);
      const line = lines.find(item => item.id === action.id && !item.deleted);
      return {
        ...state,
        lines,
        lastOperation: null,
        activeId: line?.id ?? null,
        mode: line ? (line.coordinates.length < 2 ? "draw" : "edit") : "view",
      };
    }
    case "startNew":
      return {
        ...commit(state, [
          ...dropUnfinished(state.lines),
          {
            id: action.id,
            kind: action.kind,
            name: "",
            coordinates: [],
            isNew: true,
          },
        ]),
        activeId: action.id,
        mode: "draw",
      };
    case "finishDraw": {
      const line = state.lines.find(item => item.id === state.activeId);
      return line && line.coordinates.length >= 2
        ? { ...state, mode: "edit", lastOperation: null }
        : state;
    }
    case "continueDraw":
      return state.activeId
        ? { ...state, mode: "draw", lastOperation: null }
        : state;
    case "coordinates": {
      const line = state.lines.find(item => item.id === state.activeId);
      if (!line) return state;
      const coordinates = action.update(line.coordinates, line, state.mode);
      if (!coordinates) return state;
      return commit(
        state,
        state.lines.map(item =>
          item.id === line.id ? { ...item, coordinates } : item,
        ),
        action.operation ? `${action.operation}:${line.id}` : null,
      );
    }
    case "rename":
      return commit(
        state,
        state.lines.map(line =>
          line.id === action.id ? { ...line, name: action.name } : line,
        ),
        `rename:${action.id}`,
      );
    case "remove": {
      const next = commit(
        state,
        state.lines.flatMap(line =>
          line.id !== action.id
            ? [line]
            : line.isNew
              ? []
              : [{ ...line, deleted: true }],
        ),
      );
      return state.activeId === action.id
        ? { ...next, activeId: null, mode: "view" }
        : next;
    }
    case "restore":
      return commit(
        state,
        state.lines.map(line =>
          line.id === action.id ? { ...line, deleted: false } : line,
        ),
      );
    case "undo": {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return keepSelection({
        ...state,
        lines: previous,
        history: state.history.slice(0, -1),
        future: [...state.future, state.lines],
        lastOperation: null,
      });
    }
    case "redo": {
      const next = state.future.at(-1);
      if (!next) return state;
      return keepSelection({
        ...state,
        lines: next,
        history: [...state.history, state.lines],
        future: state.future.slice(0, -1),
        lastOperation: null,
      });
    }
    case "reset":
      return initialState(action.lines);
  }
}

/**
 * 位置の修正の状態。コースとリフトの線を1つにまとめて持ち、
 * 画面ごとに種類で絞って使う。元に戻す・やり直すは線の集まり全体に効く。
 */
export function useGeometryEditor(features: CorrectionFeature[]) {
  const [state, dispatch] = useReducer(
    reducer,
    features,
    (initial: CorrectionFeature[]) => initialState(linesFromFeatures(initial)),
  );
  const actions = useMemo(
    () => ({
      select: (id: string | null) => dispatch({ type: "select", id }),
      startNew: (kind: CorrectionKind) =>
        dispatch({
          type: "startNew",
          kind,
          id: `new-${crypto.randomUUID()}`,
        }),
      finishDraw: () => dispatch({ type: "finishDraw" }),
      continueDraw: () => dispatch({ type: "continueDraw" }),
      appendVertex: (point: LngLat) =>
        dispatch({
          type: "coordinates",
          update: coordinates => [...coordinates, point],
        }),
      moveVertex: (index: number, point: LngLat) =>
        dispatch({
          type: "coordinates",
          operation: `move:${index}`,
          update: coordinates =>
            coordinates.map((value, position) =>
              position === index ? point : value,
            ),
        }),
      insertVertex: (index: number, point: LngLat) =>
        dispatch({
          type: "coordinates",
          update: coordinates => [
            ...coordinates.slice(0, index),
            point,
            ...coordinates.slice(index),
          ],
        }),
      deleteVertex: (index: number) =>
        dispatch({
          type: "coordinates",
          // 新しい線を描いている間だけ0点まで戻せる。それ以外は線として残る2点を保つ
          update: (coordinates, line, mode) =>
            coordinates.length > (line.isNew && mode === "draw" ? 0 : 2)
              ? coordinates.filter((_, position) => position !== index)
              : null,
        }),
      rename: (id: string, name: string) =>
        dispatch({ type: "rename", id, name }),
      /** 登録済みの線は削除の提案、新しく描いた線はその場で消す */
      remove: (id: string) => dispatch({ type: "remove", id }),
      restore: (id: string) => dispatch({ type: "restore", id }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      reset: (next: CorrectionFeature[]) =>
        dispatch({ type: "reset", lines: linesFromFeatures(next) }),
    }),
    [],
  );
  const active =
    state.lines.find(line => line.id === state.activeId && !line.deleted) ??
    null;
  return {
    lines: state.lines,
    active,
    mode: active ? state.mode : ("view" as GeometryMode),
    canUndo: state.history.length > 0,
    canRedo: state.future.length > 0,
    ...actions,
  };
}

export type GeometryEditor = ReturnType<typeof useGeometryEditor>;
