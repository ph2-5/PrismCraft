import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StoryBeat } from "@/domain/schemas";

const { mockConfirm, mockT, mockErrorLogger } = vi.hoisted(() => ({
  mockConfirm: vi.fn(),
  mockT: vi.fn((key: string, params?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "beat.shotNumber": `镜头 ${params?.number ?? 0}`,
      "beat.seconds": "秒",
      "beat.deleteBeatTitle": "删除分镜",
      "beat.deleteBeatDesc": "确定要删除此分镜吗？",
      "common.delete": "删除",
      "aria.prevBeat": "上一条",
      "aria.nextBeat": "下一条",
      "aria.moveUpBeat": "上移",
      "aria.moveDownBeat": "下移",
    };
    return map[key] ?? key;
  }),
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: mockConfirm,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

// SHOT_SIZE_OPTIONS / CAMERA_MOVEMENT_OPTIONS 来自 @/modules/shot，会触发链式导入。
// 这里直接 mock 它们以避免引入大量依赖（如 shot-prompt 等）。
vi.mock("@/modules/shot", () => ({
  SHOT_SIZE_OPTIONS: [
    { value: "medium", labelKey: "shotSize.medium", label: "中景" },
    { value: "wide", labelKey: "shotSize.wide", label: "远景" },
  ],
  CAMERA_MOVEMENT_OPTIONS: [
    { value: "static", labelKey: "cameraMovement.static", label: "固定" },
    { value: "push", labelKey: "cameraMovement.push", label: "推进" },
  ],
}));

import { BeatNavigation } from "../BeatNavigation";

function createBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat-1",
    sequence: 0,
    description: "",
    duration: 5,
    characterIds: [],
    sceneId: undefined,
    sceneTransitions: undefined,
    sceneElements: undefined,
    elementIds: [],
    shotType: undefined,
    shotInstruction: {
      shotSize: "medium" as never,
      cameraMovement: "static" as never,
      cameraAngle: "eye_level" as never,
    },
    ...overrides,
  } as unknown as StoryBeat;
}

describe("BeatNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
  });

  it("应在左侧显示 1-based 的分镜序号 badge", () => {
    render(
      <BeatNavigation
        beat={createBeat({ id: "b1" })}
        index={0}
        totalBeats={3}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={vi.fn()}
      />,
    );
    expect(screen.getByText("1")).not.toBeNull();
  });

  it("beat.title 存在时应直接展示 beat.title", () => {
    render(
      <BeatNavigation
        beat={createBeat({ id: "b1", title: "开场镜头" } as Partial<StoryBeat>)}
        index={2}
        totalBeats={5}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={vi.fn()}
      />,
    );
    expect(screen.getByText("开场镜头")).not.toBeNull();
  });

  it("beat.title 缺失时应使用 t('beat.shotNumber', { number }) 渲染默认标题", () => {
    render(
      <BeatNavigation
        beat={createBeat()}
        index={3}
        totalBeats={5}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={vi.fn()}
      />,
    );
    expect(mockT).toHaveBeenCalledWith("beat.shotNumber", { number: 4 });
    expect(screen.getByText("镜头 4")).not.toBeNull();
  });

  it("应渲染 shotSize 和 cameraMovement 的本地化标签", () => {
    render(
      <BeatNavigation
        beat={createBeat()}
        index={0}
        totalBeats={2}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={vi.fn()}
      />,
    );
    expect(mockT).toHaveBeenCalledWith("shotSize.medium");
    expect(mockT).toHaveBeenCalledWith("cameraMovement.static");
  });

  it("应渲染 duration 字段（带 '秒' 单位）", () => {
    render(
      <BeatNavigation
        beat={createBeat({ duration: 8 } as Partial<StoryBeat>)}
        index={0}
        totalBeats={2}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={vi.fn()}
      />,
    );
    expect(screen.getByText(/8秒/)).not.toBeNull();
  });

  it("点击上一条按钮应调用 onPrevBeat", async () => {
    const onPrevBeat = vi.fn();
    render(
      <BeatNavigation
        beat={createBeat()}
        index={1}
        totalBeats={3}
        onPrevBeat={onPrevBeat}
        onNextBeat={vi.fn()}
        onDeleteBeat={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "上一条" }));
    expect(onPrevBeat).toHaveBeenCalledTimes(1);
  });

  it("点击下一条按钮应调用 onNextBeat", async () => {
    const onNextBeat = vi.fn();
    render(
      <BeatNavigation
        beat={createBeat()}
        index={0}
        totalBeats={3}
        onPrevBeat={vi.fn()}
        onNextBeat={onNextBeat}
        onDeleteBeat={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "下一条" }));
    expect(onNextBeat).toHaveBeenCalledTimes(1);
  });

  it("index=0 时上一条 / 上移按钮应 disabled", () => {
    render(
      <BeatNavigation
        beat={createBeat()}
        index={0}
        totalBeats={3}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={vi.fn()}
      />,
    );
    const prevBtn = screen.getByRole("button", { name: "上一条" }) as HTMLButtonElement;
    const moveUpBtn = screen.getByRole("button", { name: "上移" }) as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
    expect(moveUpBtn.disabled).toBe(true);
  });

  it("index = totalBeats - 1 时下一条 / 下移按钮应 disabled", () => {
    render(
      <BeatNavigation
        beat={createBeat()}
        index={2}
        totalBeats={3}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={vi.fn()}
      />,
    );
    const nextBtn = screen.getByRole("button", { name: "下一条" }) as HTMLButtonElement;
    const moveDownBtn = screen.getByRole("button", { name: "下移" }) as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);
    expect(moveDownBtn.disabled).toBe(true);
  });

  it("点击上移按钮应调用 onMoveBeat(beatId, 'up')", async () => {
    const onMoveBeat = vi.fn();
    render(
      <BeatNavigation
        beat={createBeat({ id: "beat-xyz" })}
        index={1}
        totalBeats={3}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onMoveBeat={onMoveBeat}
        onDeleteBeat={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "上移" }));
    expect(onMoveBeat).toHaveBeenCalledWith("beat-xyz", "up");
  });

  it("点击下移按钮应调用 onMoveBeat(beatId, 'down')", async () => {
    const onMoveBeat = vi.fn();
    render(
      <BeatNavigation
        beat={createBeat({ id: "beat-xyz" })}
        index={0}
        totalBeats={3}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onMoveBeat={onMoveBeat}
        onDeleteBeat={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "下移" }));
    expect(onMoveBeat).toHaveBeenCalledWith("beat-xyz", "down");
  });

  it("未提供 onMoveBeat 时上移按钮点击不应抛错", async () => {
    render(
      <BeatNavigation
        beat={createBeat()}
        index={1}
        totalBeats={3}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={vi.fn()}
      />,
    );
    const moveUpBtn = screen.getByRole("button", { name: "上移" });
    await expect(userEvent.setup().click(moveUpBtn)).resolves.not.toThrow();
  });

  it("确认对话框返回 true 时应调用 onDeleteBeat", async () => {
    mockConfirm.mockResolvedValue(true);
    const onDeleteBeat = vi.fn();
    render(
      <BeatNavigation
        beat={createBeat()}
        index={0}
        totalBeats={2}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={onDeleteBeat}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "删除" }));
    expect(mockConfirm).toHaveBeenCalled();
    expect(onDeleteBeat).toHaveBeenCalledTimes(1);
  });

  it("确认对话框返回 false 时不应调用 onDeleteBeat", async () => {
    mockConfirm.mockResolvedValue(false);
    const onDeleteBeat = vi.fn();
    render(
      <BeatNavigation
        beat={createBeat()}
        index={0}
        totalBeats={2}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={onDeleteBeat}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "删除" }));
    expect(onDeleteBeat).not.toHaveBeenCalled();
  });

  it("confirm 抛出异常时应调用 errorLogger.warn 且不抛错", async () => {
    const confirmErr = new Error("dialog crashed");
    mockConfirm.mockRejectedValue(confirmErr);
    const onDeleteBeat = vi.fn();
    render(
      <BeatNavigation
        beat={createBeat()}
        index={0}
        totalBeats={2}
        onPrevBeat={vi.fn()}
        onNextBeat={vi.fn()}
        onDeleteBeat={onDeleteBeat}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "删除" }));
    expect(mockErrorLogger.warn).toHaveBeenCalled();
    expect(onDeleteBeat).not.toHaveBeenCalled();
  });
});
