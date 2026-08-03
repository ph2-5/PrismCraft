/**
 * Phase 7 — use-workflow store 单元测试
 *
 * 验证自定义模板管理：保存（空画布/重名/空名拒绝）、持久化、删除、重新加载。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useWorkflowStore } from "../use-workflow";
import { createOneClickFilmTemplate } from "../../templates";
import { localStorageMock } from "@/__tests__/setup";

const CUSTOM_KEY = "ai_anim_studio_workflow.customTemplates";

function resetStore(): void {
  useWorkflowStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    run: null,
    running: false,
    customTemplates: [],
  });
}

beforeEach(() => {
  resetStore();
  localStorageMock.setItem.mockClear();
});

describe("自定义模板管理", () => {
  it("保存成功：返回模板 id，写入 state 并持久化到 localStorage", () => {
    useWorkflowStore.getState().loadWorkflow(createOneClickFilmTemplate());
    const id = useWorkflowStore.getState().saveAsTemplate("我的成片模板", "自定义描述");
    expect(id).not.toBeNull();

    const { customTemplates } = useWorkflowStore.getState();
    expect(customTemplates).toHaveLength(1);
    expect(customTemplates[0]!.name).toBe("我的成片模板");
    expect(customTemplates[0]!.description).toBe("自定义描述");
    expect(customTemplates[0]!.workflow.nodes.length).toBeGreaterThan(0);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      CUSTOM_KEY,
      expect.stringContaining("我的成片模板"),
    );
  });

  it("空画布返回 null 且不持久化", () => {
    const id = useWorkflowStore.getState().saveAsTemplate("空模板");
    expect(id).toBeNull();
    expect(localStorageMock.setItem).not.toHaveBeenCalledWith(CUSTOM_KEY, expect.any(String));
  });

  it("纯空格名称返回 null", () => {
    useWorkflowStore.getState().loadWorkflow(createOneClickFilmTemplate());
    const id = useWorkflowStore.getState().saveAsTemplate("   ");
    expect(id).toBeNull();
  });

  it("与预设模板重名返回 null", () => {
    useWorkflowStore.getState().loadWorkflow(createOneClickFilmTemplate());
    const id = useWorkflowStore.getState().saveAsTemplate("一键成片");
    expect(id).toBeNull();
  });

  it("与已有自定义模板重名返回 null", () => {
    useWorkflowStore.getState().loadWorkflow(createOneClickFilmTemplate());
    useWorkflowStore.getState().saveAsTemplate("A 模板");
    const id = useWorkflowStore.getState().saveAsTemplate("A 模板");
    expect(id).toBeNull();
  });

  it("删除自定义模板：state 与 localStorage 同步移除", () => {
    useWorkflowStore.getState().loadWorkflow(createOneClickFilmTemplate());
    const id = useWorkflowStore.getState().saveAsTemplate("待删除模板") as string;
    useWorkflowStore.getState().deleteCustomTemplate(id);
    expect(useWorkflowStore.getState().customTemplates).toHaveLength(0);
    expect(localStorageMock.setItem).toHaveBeenLastCalledWith(CUSTOM_KEY, "[]");
  });

  it("自定义模板可重新加载为画布", () => {
    useWorkflowStore.getState().loadWorkflow(createOneClickFilmTemplate());
    const id = useWorkflowStore.getState().saveAsTemplate("可加载模板") as string;
    const tpl = useWorkflowStore.getState().customTemplates.find((ct) => ct.id === id);
    expect(tpl).toBeDefined();
    useWorkflowStore.getState().loadWorkflow(tpl!.workflow);
    const { nodes, edges } = useWorkflowStore.getState();
    expect(nodes).toHaveLength(5);
    expect(edges).toHaveLength(5);
  });
});
