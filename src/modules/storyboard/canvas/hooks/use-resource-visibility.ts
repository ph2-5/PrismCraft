import { useCallback, useEffect, useState } from "react";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import { computeUnboundResourceIds } from "./use-canvas-bindings";

/**
 * 画布资源节点可见性管理（"添加角色/场景"面板）。
 *
 * 策略（面向大量角色/场景）：
 * - 初始默认只显示"已绑定"资源，未绑定资源通过面板按需加入
 * - 资源被绑定（出现在任一 beat）后自动上画布（从隐藏集移除）
 * - 资源被删除后自动从隐藏集清理
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
  const [showResourcePicker, setShowResourcePicker] = useState(false);

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
    showResourcePicker,
    setShowResourcePicker,
    toggleResourceVisibility,
    showAllResources,
    showBoundOnly,
  };
}
