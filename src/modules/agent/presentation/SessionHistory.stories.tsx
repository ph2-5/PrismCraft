import type { Meta, StoryObj } from "@storybook/react";
import { SessionHistory } from "./SessionHistory";
import type { SessionListItem } from "@/modules/agent-session";

const meta: Meta<typeof SessionHistory> = {
  title: "Agent/SessionHistory",
  component: SessionHistory,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof SessionHistory>;

const sessions: SessionListItem[] = [
  { id: "s1", title: "角色设计：凌风", messageCount: 12, createdAt: Date.now() - 120000, updatedAt: Date.now() - 60000 },
  { id: "s2", title: "场景生成：雪山之巅", messageCount: 8, createdAt: Date.now() - 7200000, updatedAt: Date.now() - 3600000 },
  { id: "s3", title: "故事大纲：剑与魔法", messageCount: 25, createdAt: Date.now() - 172800000, updatedAt: Date.now() - 86400000 },
  { id: "s4", title: "道具设计：青锋剑", messageCount: 5, createdAt: Date.now() - 1209600000, updatedAt: Date.now() - 604800000 },
];

export const Default: Story = {
  args: {
    sessions,
    currentSessionId: "s1",
    onLoad: (_id: string) => {},
    onDelete: (_id: string) => {},
    onNew: () => {},
  },
};

export const Empty: Story = {
  args: {
    sessions: [],
    currentSessionId: "",
    onLoad: (_id: string) => {},
    onDelete: (_id: string) => {},
    onNew: () => {},
  },
};
