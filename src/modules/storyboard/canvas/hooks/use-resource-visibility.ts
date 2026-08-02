import { useCallback, useEffect, useRef, useState } from "react";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { computeUnboundResourceIds } from "./use-canvas-bindings";

/** 收集当前所有已被任一 beat 绑定的资源 id */
function collectBoundIds(beats: StoryBeat[]): Set<string> {
  const bound = new Set<string>();
  for (const beat of beats) {
    for (const id of beat.characterIds ?? []) bound.add(id);
    if (beat.sceneId) bound.add(beat.sceneId);
  }
  return bound;
}

/**
 * 画布资源节点可见性管理（"添加角色/场景"面板）。
 *
 * 策略（面向大量角色/场景）：
 * - 初始默认只显示"已绑定"资源，未绑定资源通过面板按需加入
 * - 资源新近被绑定（从未绑定 → 绑定）后自动上画布（从隐藏集移除）
 * - 新增角色/场景默认隐藏（避免大量资源全部堆叠上画布），通过面板按需加入
 * - 资源被删除后自动从隐藏集清理
 * - 用户显式 toggle 优先：显式隐藏的已绑定资源不会被自动显示，显式显示的未绑定资源不会被重新隐藏
 * - 仅影响画布显示，不改变任何绑定关系
 */
export function useResourceVisibility(
  initialUnboundIds: string[],
  beats: StoryBeat[],
  characters: Character[],
  scenes: Scene[],
) {
  const [hiddenResourceIds, setHiddenResourceIds] = useState<Set<string>>(
    () => new Set(initialUnboundIds),
  );

  // 上一轮已绑定集合（识别"新绑定"，绑定后自动上画布）
  const prevBoundRef = useRef<Set<string>>(new Set());
  // 首帧基线是否已记录（新增资源默认隐藏只对"之后新增"的资源生效）
  const initializedRef = useRef(false);
  // 上一轮全部资源 id 集合（识别"新增资源"）
  const prevResourceIdsRef = useRef<Set<string>>(new Set());

  // 清理已删除的资源 id（隐藏集 = 初始默认未绑定 + 用户显式操作，尊重用户选择，不强制自动显示）
  useEffect(() => {
    setHiddenResourceIds((prev) => {
      const existing = new Set([
        ...characters.map((c) => c.id),
        ...scenes.map((s) => s.id),
      ]);
      let needsChange = false;
      for (const id of prev) {
        if (!existing.has(id)) {
          needsChange = true;
          break;
        }
      }
      if (!needsChange) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        if (existing.has(id)) next.add(id);
      }
      return next;
    });
  }, [characters, scenes]);

  // 资源新近被绑定 → 自动上画布（从隐藏集移除）。仅处理"上一轮未绑定"的资源，
  // 因此用户显式隐藏的已绑定资源不受影响；重新绑定（解绑后再绑）视为新主动行为，再次自动显示。
  useEffect(() => {
    const bound = collectBoundIds(beats);
    const prev = prevBoundRef.current;
    const newlyBound = [...bound].filter((id) => !prev.has(id));
    prevBoundRef.current = bound;
    if (newlyBound.length === 0) return;
    setHiddenResourceIds((prevHidden) => {
      let needsChange = false;
      for (const id of newlyBound) {
        if (prevHidden.has(id)) {
          needsChange = true;
          break;
        }
      }
      if (!needsChange) return prevHidden;
      const next = new Set(prevHidden);
      for (const id of newlyBound) next.delete(id);
      return next;
    });
  }, [beats]);

  // 新增角色/场景 → 默认隐藏（除非已绑定）。首帧只记录基线，由 initialUnboundIds 决定初始可见性。
  useEffect(() => {
    const currentIds = new Set([
      ...characters.map((c) => c.id),
      ...scenes.map((s) => s.id),
    ]);
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevResourceIdsRef.current = currentIds;
      return;
    }
    const bound = collectBoundIds(beats);
    const prev = prevResourceIdsRef.current;
    const added = [...currentIds].filter((id) => !prev.has(id) && !bound.has(id));
    prevResourceIdsRef.current = currentIds;
    if (added.length === 0) return;
    setHiddenResourceIds((prevHidden) => {
      let needsChange = false;
      for (const id of added) {
        if (!prevHidden.has(id)) {
          needsChange = true;
          break;
        }
      }
      if (!needsChange) return prevHidden;
      const next = new Set(prevHidden);
      for (const id of added) next.add(id);
      return next;
    });
  }, [beats, characters, scenes]);

  const toggleResourceVisibility = useCallback(
    (resourceId: string, visible: boolean) => {
      setHiddenResourceIds((prev) => {
        const next = new Set(prev);
        if (visible) {
          next.delete(resourceId);
        } else {
          next.add(resourceId);
        }
        return next;
      });
    },
    [],
  );

  /** 显示全部资源 */
  const showAllResources = useCallback(() => {
    setHiddenResourceIds(new Set());
  }, []);

  /** 仅显示已绑定资源（隐藏全部未绑定） */
  const showBoundOnly = useCallback(() => {
    setHiddenResourceIds(
      new Set(computeUnboundResourceIds(beats, characters, scenes)),
    );
  }, [beats, characters, scenes]);

  return {
    hiddenResourceIds,
    toggleResourceVisibility,
    showAllResources,
    showBoundOnly,
  };
}
