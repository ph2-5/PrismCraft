import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StoryBeat } from "@/domain/schemas";

const { mockT } = vi.hoisted(() => ({
  mockT: vi.fn((key: string) => {
    const map: Record<string, string> = {
      "shotContractEditor.title": "镜头契约",
      "shotContractEditor.subtitle": "批量编辑所有分镜的镜头参数",
      "shotContractEditor.beat": "分镜",
      "shotContractEditor.duration": "时长（秒）",
      "shotContractEditor.empty": "暂无分镜",
      "beat.shotSize": "景别",
      "beat.cameraMovement": "运镜",
      "beat.angle": "角度",
      "beat.lighting": "灯光",
      "shotOption.size.medium.label": "中景",
      "shotOption.size.wide.label": "全景",
      "shotOption.movement.static.label": "固定",
      "shotOption.movement.push.label": "推",
      "shotOption.angle.eye-level.label": "平拍",
      "shotOption.angle.low.label": "仰视",
      "shotOption.lighting.natural.label": "自然光",
      "shotOption.lighting.low-key.label": "低调光",
    };
    return map[key] ?? key;
  }),
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/domain/utils", () => ({
  SHOT_SIZE_OPTIONS: [
    { value: "medium", labelKey: "shotOption.size.medium.label", label: "中景" },
    { value: "wide", labelKey: "shotOption.size.wide.label", label: "全景" },
  ],
  CAMERA_MOVEMENT_OPTIONS: [
    { value: "static", labelKey: "shotOption.movement.static.label", label: "固定" },
    { value: "push", labelKey: "shotOption.movement.push.label", label: "推" },
  ],
  CAMERA_ANGLE_OPTIONS: [
    { value: "eye_level", labelKey: "shotOption.angle.eye-level.label", label: "平拍" },
    { value: "low", labelKey: "shotOption.angle.low.label", label: "仰视" },
  ],
  SHOT_LIGHTING_OPTIONS: [
    { value: "natural", labelKey: "shotOption.lighting.natural.label", label: "自然光" },
    { value: "low_key", labelKey: "shotOption.lighting.low-key.label", label: "低调光" },
  ],
}));

import { ShotContractEditor } from "../ShotContractEditor";

function createBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 0,
    title: "开场",
    description: "",
    content: "主角走进房间",
    duration: 5,
    type: "action",
    characterIds: [],
    elementIds: [],
    enhancedGeneration: false,
    ...overrides,
  };
}

describe("ShotContractEditor", () => {
  const onUpdateBeat = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染所有分镜行，默认折叠可通过标题展开", async () => {
    render(
      <ShotContractEditor
        beats={[createBeat(), createBeat({ id: "beat-2", title: "冲突", duration: 8 })]}
        onUpdateBeat={onUpdateBeat}
      />,
    );
    // 默认折叠：只有标题可见
    expect(screen.getByText("镜头契约")).toBeInTheDocument();
    await userEvent.click(screen.getByText("镜头契约"));
    expect(screen.getByText("开场")).toBeInTheDocument();
    expect(screen.getByText("冲突")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("5")).toHaveLength(1);
    expect(screen.getAllByDisplayValue("8")).toHaveLength(1);
  });

  it("修改景别触发 onUpdateBeat 写入 shotInstruction", async () => {
    render(
      <ShotContractEditor
        beats={[createBeat({ shotInstruction: { shotSize: "medium", cameraMovement: "static", cameraAngle: "eye_level" } })]}
        onUpdateBeat={onUpdateBeat}
      />,
    );
    await userEvent.click(screen.getByText("镜头契约"));

    const shotSizeSelect = screen.getAllByRole("combobox")[0]!;
    await userEvent.selectOptions(shotSizeSelect, "wide");
    expect(onUpdateBeat).toHaveBeenCalledWith("beat-1", {
      shotInstruction: expect.objectContaining({ shotSize: "wide" }),
    });
  });

  it("修改时长触发 onUpdateBeat 写入 duration", async () => {
    render(
      <ShotContractEditor
        beats={[createBeat()]}
        onUpdateBeat={onUpdateBeat}
      />,
    );
    await userEvent.click(screen.getByText("镜头契约"));

    const durationInput = screen.getByDisplayValue("5");
    fireEvent.change(durationInput, { target: { value: "7" } });
    expect(onUpdateBeat).toHaveBeenCalledWith(
      "beat-1",
      expect.objectContaining({ duration: 7 }),
    );
  });

  it("无 shotInstruction 的 beat 以默认值渲染且编辑时创建", async () => {
    render(
      <ShotContractEditor beats={[createBeat()]} onUpdateBeat={onUpdateBeat} />,
    );
    await userEvent.click(screen.getByText("镜头契约"));

    const selects = screen.getAllByRole("combobox");
    expect(selects[0]).toHaveValue("medium");
    expect(selects[1]).toHaveValue("static");
    expect(selects[2]).toHaveValue("eye_level");
    expect(selects[3]).toHaveValue("natural");
  });

  it("空 beats 显示空状态文案", async () => {
    render(<ShotContractEditor beats={[]} onUpdateBeat={onUpdateBeat} />);
    await userEvent.click(screen.getByText("镜头契约"));
    expect(screen.getByText("暂无分镜")).toBeInTheDocument();
  });
});
