# shot/sub-shot

单分镜多镜头子实体管理（Task 4.10）。

## 子域

| 子域 | 说明 | 公共 API |
|------|------|----------|
| services | SubShot CRUD 业务逻辑 | listSubShots, createSubShot, updateSubShot, deleteSubShot, moveSubShot, reorderSubShots |
| hooks | React 状态管理 | useSubShots |
| presentation | UI 组件 | SubShotList |

## 公共 API

- `listSubShots(beatId)` — 获取分镜下所有子镜头
- `createSubShot(beatId, input)` — 创建子镜头（自动追加序号）
- `updateSubShot(id, updates)` — 更新子镜头
- `deleteSubShot(id)` — 删除子镜头（软删除）
- `moveSubShot(beatId, fromIndex, toIndex)` — 移动子镜头位置
- `reorderSubShots(beatId, orderedIds)` — 批量重排序
- `useSubShots(beatId)` — React Hook，管理子镜头列表状态
- `SubShotList` — UI 组件，显示/编辑子镜头列表

## 边界约束

- 通过 DI container 获取 ISubShotStorage（不直接导入 infrastructure/storage）
- 禁止导入 story 或 video 模块
- SubShot.duration 范围 1-30 秒
