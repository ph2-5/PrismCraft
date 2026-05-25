"use client";

import { useState } from "react";

export function useStableDeps<T extends Record<string, unknown>>(obj: T): T {
  const serialized = JSON.stringify(obj);
  const [prevSerialized, setPrevSerialized] = useState(serialized);
  const [stableObj, setStableObj] = useState(obj);

  if (serialized !== prevSerialized) {
    setPrevSerialized(serialized);
    setStableObj(obj);
  }

  return stableObj;
}
