import type { Meta, StoryObj } from "@storybook/react";
import { ToolCallCard } from "./ToolCallCard";
import type { ToolExecution } from "../domain/types";

const meta: Meta<typeof ToolCallCard> = {
  title: "Agent/ToolCallCard",
  component: ToolCallCard,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ToolCallCard>;

const baseExecution: ToolExecution = {
  id: "exec-1",
  toolCall: {
    id: "call-1",
    function: {
      name: "generate_character_image",
      arguments: JSON.stringify({ prompt: "一个勇敢的少年剑士，黑色短发，穿着蓝色铠甲" }),
    },
  },
  status: "done",
  result: {
    success: true,
    data: { imageUrl: "https://via.placeholder.com/256x384", prompt: "一个勇敢的少年剑士" },
  },
  startedAt: Date.now(),
};

export const Done: Story = {
  args: { execution: baseExecution },
};

export const Running: Story = {
  args: {
    execution: {
      ...baseExecution,
      id: "exec-2",
      status: "running",
      progress: "正在生成图片...",
      result: undefined,
      endedAt: undefined,
    },
  },
};

export const Error: Story = {
  args: {
    execution: {
      ...baseExecution,
      id: "exec-3",
      status: "error",
      result: { success: false, error: "API 调用失败：超出最大 token 限制" },
    },
  },
};

export const TextToSpeech: Story = {
  args: {
    execution: {
      ...baseExecution,
      id: "exec-4",
      toolCall: {
        id: "call-2",
        function: {
          name: "text_to_speech",
          arguments: JSON.stringify({ text: "你好，世界" }),
        },
      },
      result: {
        success: true,
        data: { audioUrl: "https://example.com/audio.mp3" },
      },
    },
  },
};
