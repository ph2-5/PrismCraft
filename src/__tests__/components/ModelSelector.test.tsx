import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelSelector } from "@/modules/prompt";

const mockLoadConfig = vi.fn();

vi.mock("@/infrastructure/di", () => ({
  container: {
    loadConfig: () => mockLoadConfig(),
  },
}));

describe("ModelSelector - API Key 边界状态", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未配置 API Key 时应显示引导链接", async () => {
    mockLoadConfig.mockResolvedValue({ providers: [] });

    render(
      <ModelSelector
        capability="video"
        value={null}
        onChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/请先配置视频模型/)).toBeInTheDocument();
    });

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/settings");
  });

  it("已配置 API Key 时应显示模型选择器", async () => {
    mockLoadConfig.mockResolvedValue({
      providers: [
        {
          id: "seedance",
          name: "Seedance",
          models: [
            { id: "seedance-v1", name: "Seedance V1", capabilities: ["video"] },
          ],
        },
      ],
    });

    render(
      <ModelSelector
        capability="video"
        value={null}
        onChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/默认模型/)).toBeInTheDocument();
    });
  });

  it("加载配置失败时应显示错误引导", async () => {
    mockLoadConfig.mockRejectedValue(new Error("Failed to load"));

    render(
      <ModelSelector
        capability="image"
        value={null}
        onChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/请先配置图片模型/)).toBeInTheDocument();
    });
  });

  it("选择模型时应触发 onChange 回调", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    mockLoadConfig.mockResolvedValue({
      providers: [
        {
          id: "seedance",
          name: "Seedance",
          models: [
            { id: "seedance-v1", name: "Seedance V1", capabilities: ["video"] },
          ],
        },
      ],
    });

    render(
      <ModelSelector
        capability="video"
        value={null}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("combobox"));

    // 使用 findByText 等待异步出现的选项，增加超时到 10 秒
    const seedanceOption = await screen.findByText(/Seedance V1/, {}, { timeout: 10000 });
    expect(seedanceOption).toBeInTheDocument();

    await user.click(seedanceOption);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "seedance",
        modelId: "seedance-v1",
        providerName: "Seedance",
        modelName: "Seedance V1",
      }),
    );
  });

  it("紧凑模式应使用较小尺寸", async () => {
    mockLoadConfig.mockResolvedValue({ providers: [] });

    const { container } = render(
      <ModelSelector
        capability="video"
        value={null}
        onChange={() => {}}
        compact={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/请先配置视频模型/)).toBeInTheDocument();
    });

    expect(container.querySelector(".text-xs")).toBeInTheDocument();
  });
});
