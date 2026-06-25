import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockConfirm, mockDeleteAutoSave, mockLoadAutoSaves, mockIsElectron, mockT, mockErrorLogger } = vi.hoisted(() => ({
  mockConfirm: vi.fn(),
  mockDeleteAutoSave: vi.fn().mockResolvedValue(undefined),
  mockLoadAutoSaves: vi.fn(),
  mockIsElectron: vi.fn(() => true),
  mockT: vi.fn((key: string, params?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "crash.dismissConfirmMsg": "确定要清除所有自动保存记录吗？",
      "crash.dismissConfirmTitle": "清除确认",
      "crash.unsavedData": "检测到未保存数据",
      "crash.unsavedDataDesc": `发现 ${params?.count ?? 0} 条自动保存记录`,
      "crash.dismissAndClearConfirm": "清除并忽略",
      "crash.acknowledged": "我知道了",
      "crash.unknownTime": "未知时间",
      "crash.unknownType": "未知类型",
      "crash.moreRecords": `还有 ${params?.count ?? 0} 条记录`,
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

vi.mock("@/shared/utils/platform", () => ({
  isElectron: mockIsElectron,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

import { CrashRecoveryDialog } from "../CrashRecoveryDialog";

describe("R70: Irreversible data clearing must require confirmation", () => {
  const sampleSaves = [
    { id: "save-1", type: "story", data_json: "{}", timestamp: Date.now() - 1000 },
    { id: "save-2", type: "beat", data_json: "{}", timestamp: Date.now() - 2000 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAutoSaves.mockResolvedValue(sampleSaves);
    mockConfirm.mockResolvedValue(true);
    mockDeleteAutoSave.mockResolvedValue(undefined);
    mockIsElectron.mockReturnValue(true);
  });

  it("clicking dismiss calls confirm()", async () => {
    render(
      <CrashRecoveryDialog
        loadAutoSaves={mockLoadAutoSaves}
        deleteAutoSave={mockDeleteAutoSave}
      />,
    );

    const dismissButton = await screen.findByRole("button", { name: /清除并忽略/ });
    await userEvent.setup().click(dismissButton);

    expect(mockConfirm).toHaveBeenCalledWith(
      "确定要清除所有自动保存记录吗？",
      "清除确认",
    );
  });

  it("if confirm is cancelled, deleteAutoSave is NOT called", async () => {
    mockConfirm.mockResolvedValue(false);

    render(
      <CrashRecoveryDialog
        loadAutoSaves={mockLoadAutoSaves}
        deleteAutoSave={mockDeleteAutoSave}
      />,
    );

    const dismissButton = await screen.findByRole("button", { name: /清除并忽略/ });
    await userEvent.setup().click(dismissButton);

    expect(mockConfirm).toHaveBeenCalled();
    expect(mockDeleteAutoSave).not.toHaveBeenCalled();
  });

  it("if confirm is accepted, deleteAutoSave IS called for each save", async () => {
    mockConfirm.mockResolvedValue(true);

    render(
      <CrashRecoveryDialog
        loadAutoSaves={mockLoadAutoSaves}
        deleteAutoSave={mockDeleteAutoSave}
      />,
    );

    const dismissButton = await screen.findByRole("button", { name: /清除并忽略/ });
    await userEvent.setup().click(dismissButton);

    expect(mockConfirm).toHaveBeenCalled();
    expect(mockDeleteAutoSave).toHaveBeenCalledTimes(sampleSaves.length);
    expect(mockDeleteAutoSave).toHaveBeenCalledWith("save-1");
    expect(mockDeleteAutoSave).toHaveBeenCalledWith("save-2");
  });
});
