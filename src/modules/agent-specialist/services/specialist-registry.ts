/**
 * Specialist 注册表（P4 多 Agent 编排）
 *
 * 设计要点：
 * - 统一管理所有 Specialist（内置 + 用户自定义）
 * - 按 id 唯一注册，重名抛错
 * - 单例模式，全局共享
 * - 与 ToolRegistry 模式一致，便于维护
 *
 * 使用方式：
 *   import { specialistRegistry } from "./specialist-registry";
 *   specialistRegistry.get("character-creator");
 */

import type { SpecialistAgent } from "../domain/specialist-types";
import { BUILTIN_SPECIALISTS } from "../domain/specialist-types";
import { t } from "@/shared/constants/messages";

class SpecialistRegistry {
  private specialists = new Map<string, SpecialistAgent>();
  private registered = false;

  /** 注册 Specialist（重名抛错） */
  register(specialist: SpecialistAgent): void {
    if (this.specialists.has(specialist.id)) {
      throw new Error(t("error.specialistAlreadyRegistered", { id: specialist.id }));
    }
    this.specialists.set(specialist.id, specialist);
  }

  /** 批量注册 */
  registerAll(specialists: SpecialistAgent[]): void {
    for (const s of specialists) {
      this.register(s);
    }
  }

  /** 注册所有内置 Specialist（幂等） */
  registerBuiltins(): void {
    if (this.registered) return;
    this.registerAll(BUILTIN_SPECIALISTS);
    this.registered = true;
  }

  /** 按 id 获取 Specialist */
  get(id: string): SpecialistAgent | undefined {
    return this.specialists.get(id);
  }

  /** 是否已注册 */
  has(id: string): boolean {
    return this.specialists.has(id);
  }

  /** 列出所有 Specialist（按 id 排序） */
  list(): SpecialistAgent[] {
    return Array.from(this.specialists.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** 获取所有 Specialist 的摘要（传给 LLM 帮助决策） */
  listSummaries(): Array<{ id: string; name: string; description: string }> {
    return this.list().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    }));
  }

  /** 获取数量 */
  size(): number {
    return this.specialists.size;
  }

  /** 清空（仅测试用） */
  clear(): void {
    this.specialists.clear();
    this.registered = false;
  }

  /** 卸载 Specialist */
  unregister(id: string): boolean {
    return this.specialists.delete(id);
  }
}

/** 全局 Specialist 注册表单例 */
export const specialistRegistry = new SpecialistRegistry();

export { SpecialistRegistry };
