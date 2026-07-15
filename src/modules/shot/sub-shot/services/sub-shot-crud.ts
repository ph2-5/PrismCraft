/**
 * SubShot CRUD Service — 子镜头增删改查业务逻辑（Task 4.10）
 *
 * 职责：
 *   - 通过 DI container 获取 ISubShotStorage
 *   - 生成 SubShot ID（subshot- 前缀 + 时间戳 + 随机数）
 *   - 管理序号（新增时自动追加到末尾）
 *   - 提供批量操作和排序
 */
import { container } from "@/infrastructure/di";
import type { SubShot } from "@/domain/schemas";

function generateSubShotId(): string {
  return `subshot-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export async function listSubShots(beatId: string): Promise<SubShot[]> {
  const storage = container.subShotStorage;
  return storage.getSubShotsByBeatId(beatId);
}

export async function createSubShot(
  beatId: string,
  input: Partial<Omit<SubShot, "id" | "storyBeatId" | "createdAt" | "updatedAt">>,
): Promise<SubShot> {
  const storage = container.subShotStorage;
  const existing = await storage.getSubShotsByBeatId(beatId);
  const nextSequence = existing.length > 0 ? Math.max(...existing.map((s) => s.sequence)) + 1 : 0;

  const subShot: Partial<SubShot> & { id: string; storyBeatId: string } = {
    id: generateSubShotId(),
    storyBeatId: beatId,
    sequence: nextSequence,
    shotType: input.shotType ?? "medium",
    cameraMovement: input.cameraMovement ?? "static",
    cameraAngle: input.cameraAngle ?? "eye_level",
    duration: input.duration ?? 5,
    description: input.description ?? "",
    prompt: input.prompt,
    imageUrl: input.imageUrl,
    videoUrl: input.videoUrl,
    transition: input.transition,
  };

  await storage.createSubShot(subShot);

  const created = await storage.getSubShotById(subShot.id);
  if (!created) {
    throw new Error(`Failed to create SubShot: ${subShot.id}`);
  }
  return created;
}

export async function updateSubShot(
  id: string,
  updates: Partial<SubShot>,
): Promise<void> {
  const storage = container.subShotStorage;
  await storage.updateSubShot(id, updates);
}

export async function deleteSubShot(id: string): Promise<void> {
  const storage = container.subShotStorage;
  await storage.deleteSubShot(id);
}

export async function deleteSubShotsByBeatId(beatId: string): Promise<void> {
  const storage = container.subShotStorage;
  await storage.deleteSubShotsByBeatId(beatId);
}

export async function moveSubShot(
  beatId: string,
  fromIndex: number,
  toIndex: number,
): Promise<SubShot[]> {
  const storage = container.subShotStorage;
  const subShots = await storage.getSubShotsByBeatId(beatId);
  if (fromIndex < 0 || fromIndex >= subShots.length) return subShots;
  if (toIndex < 0 || toIndex >= subShots.length) return subShots;

  const [moved] = subShots.splice(fromIndex, 1);
  if (!moved) return subShots;
  subShots.splice(toIndex, 0, moved);

  const orderedIds = subShots.map((s) => s.id);
  await storage.reorderSubShots(beatId, orderedIds);

  return storage.getSubShotsByBeatId(beatId);
}

export async function reorderSubShots(
  beatId: string,
  orderedIds: string[],
): Promise<void> {
  const storage = container.subShotStorage;
  await storage.reorderSubShots(beatId, orderedIds);
}
