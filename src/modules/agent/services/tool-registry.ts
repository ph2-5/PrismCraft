/**
 * 工具注册表（ToolRegistry）
 *
 * 设计要点：
 * - 统一管理所有工具，按 name 唯一注册
 * - 支持按业务域过滤（getByDomain）
 * - 支持按工具名列表过滤（getToolDefs）
 * - 注册时校验命名冲突，避免工具间冲突
 * - 单例模式，全局共享
 */

import type { ToolDef } from "@/domain/ports/ai-provider-port";
import type { ToolImpl, ToolDomain } from "../domain/types";
import type { IToolRegistry } from "../domain/ports";

class ToolRegistry implements IToolRegistry {
  private tools = new Map<string, ToolImpl>();

  /** 注册工具（重名抛错，避免冲突） */
  register(tool: ToolImpl): void {
    const name = tool.def.function.name;
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" already registered — 命名冲突`);
    }
    this.tools.set(name, tool);
  }

  /** 批量注册 */
  registerAll(tools: ToolImpl[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 卸载工具（P3 工具插件化）
   *
   * 用于动态移除插件工具。不存在时返回 false（不抛错，便于幂等卸载）。
   * 内置工具也可被卸载，但通常不建议。
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** 按名称获取工具实现 */
  get(name: string): ToolImpl | undefined {
    return this.tools.get(name);
  }

  /** 是否已注册 */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** 获取所有工具定义（传给 LLM 的 tools 参数） */
  getToolDefs(filter?: string[]): ToolDef[] {
    const all = Array.from(this.tools.values()).map((t) => t.def);
    if (!filter || filter.length === 0) return all;
    const filterSet = new Set(filter);
    return all.filter((t) => filterSet.has(t.function.name));
  }

  /** 按业务域分组查询 */
  getByDomain(domain: ToolDomain): ToolImpl[] {
    return Array.from(this.tools.values()).filter((t) => t.domain === domain);
  }

  /** 获取所有工具名 */
  getAllNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** 获取工具数量 */
  size(): number {
    return this.tools.size;
  }

  /** 清空注册表（仅测试用） */
  clear(): void {
    this.tools.clear();
  }

  /** 获取工具描述列表（用于 system prompt） */
  getToolDescriptions(filter?: string[]): Array<{ name: string; description: string; domain: ToolDomain }> {
    const tools = filter
      ? filter.map((n) => this.tools.get(n)).filter((t): t is ToolImpl => !!t)
      : Array.from(this.tools.values());
    return tools.map((t) => ({
      name: t.def.function.name,
      description: t.def.function.description,
      domain: t.domain,
    }));
  }
}

/** 全局工具注册表单例 */
export const toolRegistry = new ToolRegistry();

export { ToolRegistry };
