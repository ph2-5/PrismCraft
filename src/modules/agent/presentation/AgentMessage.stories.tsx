import type { Meta, StoryObj } from "@storybook/react";
import { AgentMessageView } from "./AgentMessage";
import type { ToolExecution } from "../domain/types";

const meta: Meta<typeof AgentMessageView> = {
  title: "Agent/AgentMessageView",
  component: AgentMessageView,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof AgentMessageView>;

export const UserMessage: Story = {
  args: {
    message: {
      id: "msg-1",
      role: "user",
      content: "帮我生成一个勇敢的少年剑士角色",
      timestamp: Date.now(),
    },
    toolExecutions: [],
  },
};

export const AssistantMessage: Story = {
  args: {
    message: {
      id: "msg-2",
      role: "assistant",
      content: "好的，我来帮你创建一个少年剑士角色。\n\n**角色设定**：\n- 姓名：凌风\n- 年龄：16\n- 武器：青锋剑\n\n请确认是否生成角色图片？",
      timestamp: Date.now(),
    },
    toolExecutions: [],
  },
};

export const StreamingMessage: Story = {
  args: {
    message: {
      id: "msg-3",
      role: "assistant",
      content: "正在思考中...",
      timestamp: Date.now(),
      streaming: true,
    },
    toolExecutions: [],
  },
};

export const WithToolCall: Story = {
  args: {
    message: {
      id: "msg-4",
      role: "assistant",
      content: "我已经为你生成了角色图片。",
      timestamp: Date.now(),
      toolCalls: [
        {
          id: "call-1",
          function: {
            name: "generate_character_image",
            arguments: "{}",
          },
        },
      ],
    },
    toolExecutions: [
      {
        id: "call-1",
        toolCall: {
          id: "call-1",
          function: {
            name: "generate_character_image",
            arguments: JSON.stringify({ prompt: "少年剑士" }),
          },
        },
        status: "done",
        result: {
          success: true,
          data: { imageUrl: "https://via.placeholder.com/256x384" },
        },
        startedAt: Date.now(),
      } satisfies ToolExecution,
    ],
  },
};
