"use client";

// Undo/redo with group coalescing, generic over the document type.
//
// DELIBERATE DUPLICATE of components/admin/use-editor-history.ts (byte-for-byte
// below the header): the ScanMe Links editor is frozen while the §2.11 golden
// harness covers only the public render path, so importing across that boundary
// — or parameterizing the Links shell — has no automated proof of being a
// no-op. Per the RFC-001 §2.5 TASK-06 amendment, the Venue editor is standalone
// and carries its own copy; unifying the two shells is its own later task,
// gated on the risk-#1 editor E2E smoke. Do not "helpfully" re-import the
// admin copy from here.

import { useCallback, useReducer } from "react";

type HistoryState<T> = {
  past: T[];
  present: T;
  future: T[];
  lastGroup: string | null;
  lastGroupedAt: number;
};

type HistoryAction<T> =
  | {
      type: "set";
      next: T | ((current: T) => T);
      group?: string;
      timestamp: number;
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; next: T };

const HISTORY_LIMIT = 50;
const GROUP_WINDOW_MS = 700;

function historyReducer<T>(
  state: HistoryState<T>,
  action: HistoryAction<T>,
): HistoryState<T> {
  if (action.type === "reset") {
    return {
      past: [],
      present: action.next,
      future: [],
      lastGroup: null,
      lastGroupedAt: 0,
    };
  }

  if (action.type === "undo") {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
      lastGroup: null,
      lastGroupedAt: 0,
    };
  }

  if (action.type === "redo") {
    const next = state.future[0];
    if (!next) return state;
    return {
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: next,
      future: state.future.slice(1),
      lastGroup: null,
      lastGroupedAt: 0,
    };
  }

  const next =
    typeof action.next === "function"
      ? (action.next as (current: T) => T)(state.present)
      : action.next;

  if (Object.is(next, state.present)) return state;

  const grouped =
    Boolean(action.group) &&
    action.group === state.lastGroup &&
    action.timestamp - state.lastGroupedAt <= GROUP_WINDOW_MS;

  return {
    past: grouped
      ? state.past
      : [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    lastGroup: action.group ?? null,
    lastGroupedAt: action.timestamp,
  };
}

export function useVenueEditorHistory<T>(initialValue: T) {
  const [state, dispatch] = useReducer(historyReducer<T>, {
    past: [],
    present: initialValue,
    future: [],
    lastGroup: null,
    lastGroupedAt: 0,
  });

  const set = useCallback(
    (next: T | ((current: T) => T), group?: string) => {
      dispatch({
        type: "set",
        next,
        group,
        timestamp: Date.now(),
      });
    },
    [],
  );

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback(
    (next: T) => dispatch({ type: "reset", next }),
    [],
  );

  return {
    value: state.present,
    set,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
