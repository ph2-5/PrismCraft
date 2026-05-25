"use client";

import { useMemo } from "react";

function safeDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!safeDeepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
}

export function useDirtyTracker(
  current: Record<string, unknown>,
  saved: Record<string, unknown>,
): { isDirty: boolean; dirtyFields: string[] } {
  return useMemo(() => {
    const dirtyFields: string[] = [];
    const allKeys = new Set([...Object.keys(current), ...Object.keys(saved)]);

    for (const key of allKeys) {
      if (!safeDeepEqual(current[key], saved[key])) {
        dirtyFields.push(key);
      }
    }

    return { isDirty: dirtyFields.length > 0, dirtyFields };
  }, [current, saved]);
}
