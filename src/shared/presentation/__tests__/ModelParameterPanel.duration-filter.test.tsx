/**
 * Task 2A.20: ModelParameterPanel 时长 UI 动态化测试
 *
 * 验证 `resolveProfile` 根据模型 `maxDuration` 过滤时长选项：
 * - Seedance 2.5 (maxDuration=30) 显示全部 5 个选项（2/5/10/15/30）
 * - 自定义模型 (maxDuration=15) 仅显示 4 个选项（2/5/10/15），30 秒被过滤
 * - Seedance 2.0 (maxDuration 未设置) 显示全部 5 个选项（旧行为）
 * - 未选择模型 显示全部 5 个选项
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { setModelProfiles, type ModelParameterProfile } from "@/shared/model-capabilities";
import { ModelParameterPanel, type ModelParameterValues } from "../ModelParameterPanel";

const DEFAULT_VALUES: ModelParameterValues = {
  duration: 5,
  resolution: "1920x1080",
  style: "realistic",
  negativePrompt: "",
  seed: "",
  cfgScale: 7,
};

function makeProfile(caps: Record<string, unknown>): ModelParameterProfile {
  return {
    modelId: "test-model",
    capabilities: caps as unknown as ModelParameterProfile["capabilities"],
    parameters: {},
  };
}

describe("Task 2A.20: ModelParameterPanel duration UI dynamic filtering", () => {
  beforeEach(() => {
    setModelProfiles({});
  });

  it("shows all 5 duration options (including 30s) for Seedance 2.5 (maxDuration=30)", () => {
    render(
      <ModelParameterPanel
        modelId="doubao-seedance-2-5-pro-260715"
        values={DEFAULT_VALUES}
        onValuesChange={() => undefined}
      />,
    );
    // 5 个时长按钮：2/5/10/15/30 秒
    expect(screen.getByText("2秒")).toBeDefined();
    expect(screen.getByText("5秒")).toBeDefined();
    expect(screen.getByText("10秒")).toBeDefined();
    expect(screen.getByText("15秒")).toBeDefined();
    expect(screen.getByText("30秒")).toBeDefined();
  });

  it("hides 30s option for model with maxDuration=15", () => {
    setModelProfiles({
      "limited-duration-model": makeProfile({
        maxReferences: 4,
        maxResolution: 2048,
        maxSizeMB: 10,
        supportsLastFrame: true,
        referenceMode: "separate",
        maxDuration: 15,
      }),
    });
    render(
      <ModelParameterPanel
        modelId="limited-duration-model"
        values={DEFAULT_VALUES}
        onValuesChange={() => undefined}
      />,
    );
    // 2/5/10/15 秒显示
    expect(screen.getByText("2秒")).toBeDefined();
    expect(screen.getByText("5秒")).toBeDefined();
    expect(screen.getByText("10秒")).toBeDefined();
    expect(screen.getByText("15秒")).toBeDefined();
    // 30 秒应被过滤
    expect(screen.queryByText("30秒")).toBeNull();
  });

  it("shows all 5 duration options for Seedance 2.0 (maxDuration undefined, backward compatibility)", () => {
    render(
      <ModelParameterPanel
        modelId="doubao-seedance-2-0-260128"
        values={DEFAULT_VALUES}
        onValuesChange={() => undefined}
      />,
    );
    expect(screen.getByText("2秒")).toBeDefined();
    expect(screen.getByText("5秒")).toBeDefined();
    expect(screen.getByText("10秒")).toBeDefined();
    expect(screen.getByText("15秒")).toBeDefined();
    expect(screen.getByText("30秒")).toBeDefined();
  });

  it("shows 'no model selected' message when modelId is undefined", () => {
    render(
      <ModelParameterPanel
        modelId={undefined}
        values={DEFAULT_VALUES}
        onValuesChange={() => undefined}
      />,
    );
    // 未选模型时显示 "请先选择模型" 而非时长按钮
    expect(screen.getByText("请先选择模型")).toBeDefined();
    // 不应渲染任何时长按钮
    expect(screen.queryByText("2秒")).toBeNull();
    expect(screen.queryByText("30秒")).toBeNull();
  });

  it("hides 30s and 15s options for model with maxDuration=10", () => {
    setModelProfiles({
      "short-only-model": makeProfile({
        maxReferences: 4,
        maxResolution: 2048,
        maxSizeMB: 10,
        supportsLastFrame: false,
        referenceMode: "separate",
        maxDuration: 10,
      }),
    });
    render(
      <ModelParameterPanel
        modelId="short-only-model"
        values={DEFAULT_VALUES}
        onValuesChange={() => undefined}
      />,
    );
    expect(screen.getByText("2秒")).toBeDefined();
    expect(screen.getByText("5秒")).toBeDefined();
    expect(screen.getByText("10秒")).toBeDefined();
    expect(screen.queryByText("15秒")).toBeNull();
    expect(screen.queryByText("30秒")).toBeNull();
  });
});
