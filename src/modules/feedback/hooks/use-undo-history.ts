"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface HistoryEntry<T> {
  state: T;
  description: string;
  timestamp: number;
}

const MAX_HISTORY_DEPTH = 50;

export function useUndoHistory<T>(options?: {
  maxDepth?: number;
  onUndo?: (state: T, description: string) => void;
  onRedo?: (state: T, description: string) => void;
}) {
  const maxDepth = options?.maxDepth ?? MAX_HISTORY_DEPTH;
  const undoStackRef = useRef<HistoryEntry<T>[]>([]);
  const redoStackRef = useRef<HistoryEntry<T>[]>([]);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);

  const pushState = useCallback(
    (state: T, description: string) => {
      undoStackRef.current.push({
        state,
        description,
        timestamp: Date.now(),
      });
      if (undoStackRef.current.length > maxDepth) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      setUndoDepth(undoStackRef.current.length);
      setRedoDepth(0);
    },
    [maxDepth],
  );

  const undo = useCallback((): { state: T; description: string } | null => {
    const entry = undoStackRef.current.pop();
    if (!entry) return null;
    redoStackRef.current.push(entry);
    if (redoStackRef.current.length > maxDepth) {
      redoStackRef.current.shift();
    }
    optionsRef.current?.onUndo?.(entry.state, entry.description);
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(redoStackRef.current.length);
    return { state: entry.state, description: entry.description };
  }, [maxDepth]);

  const redo = useCallback((): { state: T; description: string } | null => {
    const entry = redoStackRef.current.pop();
    if (!entry) return null;
    undoStackRef.current.push(entry);
    optionsRef.current?.onRedo?.(entry.state, entry.description);
    setUndoDepth(undoStackRef.current.length);
    setRedoDepth(redoStackRef.current.length);
    return { state: entry.state, description: entry.description };
  }, []);

  const canUndo = useCallback(() => undoStackRef.current.length > 0, []);
  const canRedo = useCallback(() => redoStackRef.current.length > 0, []);

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoDepth(0);
    setRedoDepth(0);
  }, []);

  return {
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
    undoDepth,
    redoDepth,
  };
}
