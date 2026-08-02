import { useCallback, useState } from "react";

/**
 * 画布资源节点可见性管理（"添加角色/场景"面板）：
 * - hiddenResourceIds：不在画布上显示的已有角色/场景 id（不生成节点，不改变绑定关系）
 * - showResourcePicker：选择面板开关
 */
export function useResourceVisibility() {
  const [hiddenResourceIds, setHiddenResourceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showResourcePicker, setShowResourcePicker] = useState(false);

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

  return {
    hiddenResourceIds,
    showResourcePicker,
    setShowResourcePicker,
    toggleResourceVisibility,
  };
}
