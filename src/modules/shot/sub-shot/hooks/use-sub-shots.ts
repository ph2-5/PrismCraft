/**
 * useSubShots — SubShot 列表状态管理 Hook（Task 4.10）
 */
import { useCallback, useEffect, useState } from "react";
import type { SubShot } from "@/domain/schemas";
import {
  listSubShots,
  createSubShot,
  updateSubShot,
  deleteSubShot,
  moveSubShot,
} from "../services/sub-shot-crud";

export interface UseSubShotsResult {
  subShots: SubShot[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addSubShot: (input?: Partial<Omit<SubShot, "id" | "storyBeatId" | "createdAt" | "updatedAt">>) => Promise<SubShot | null>;
  editSubShot: (id: string, updates: Partial<SubShot>) => Promise<void>;
  removeSubShot: (id: string) => Promise<void>;
  moveUp: (index: number) => Promise<void>;
  moveDown: (index: number) => Promise<void>;
}

export function useSubShots(beatId: string | null | undefined): UseSubShotsResult {
  const [subShots, setSubShots] = useState<SubShot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!beatId) {
      setSubShots([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listSubShots(beatId);
      setSubShots(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubShots([]);
    } finally {
      setLoading(false);
    }
  }, [beatId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addSubShot = useCallback(
    async (input?: Partial<Omit<SubShot, "id" | "storyBeatId" | "createdAt" | "updatedAt">>) => {
      if (!beatId) return null;
      try {
        const created = await createSubShot(beatId, input ?? {});
        setSubShots((prev) => [...prev, created]);
        return created;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [beatId],
  );

  const editSubShot = useCallback(
    async (id: string, updates: Partial<SubShot>) => {
      try {
        await updateSubShot(id, updates);
        setSubShots((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const removeSubShot = useCallback(
    async (id: string) => {
      try {
        await deleteSubShot(id);
        setSubShots((prev) => prev.filter((s) => s.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const moveUp = useCallback(
    async (index: number) => {
      if (!beatId || index <= 0) return;
      try {
        const result = await moveSubShot(beatId, index, index - 1);
        setSubShots(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [beatId],
  );

  const moveDown = useCallback(
    async (index: number) => {
      if (!beatId || index >= subShots.length - 1) return;
      try {
        const result = await moveSubShot(beatId, index, index + 1);
        setSubShots(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [beatId, subShots.length],
  );

  return {
    subShots,
    loading,
    error,
    refresh,
    addSubShot,
    editSubShot,
    removeSubShot,
    moveUp,
    moveDown,
  };
}
