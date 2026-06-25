import type { Story } from "@/domain/schemas";

export type CreationMode = "quick" | "professional";
export type QuickInputMode = "direct" | "placeholder" | "plain";

export interface PlaceholderBinding {
  id: string;
  placeholder: string;
  type: "character" | "scene";
  targetId: string | null;
}

export interface QuickStoryData {
  content: string;
  placeholderBindings: PlaceholderBinding[];
}

export const DEFAULT_STORY: Story = {
  id: "",
  title: "",
  description: "",
  genre: "drama",
  tone: "neutral",
  targetDuration: 60,
  beats: [],
  characters: [],
  scenes: [],
  elementIds: [],
  createdAt: Math.floor(Date.now() / 1000),
  updatedAt: Math.floor(Date.now() / 1000),
};

export const genres = [
  { value: "drama", label: "剧情", description: "情感驱动的故事" },
  { value: "comedy", label: "喜剧", description: "轻松幽默的故事" },
  { value: "action", label: "动作", description: "紧张刺激的故事" },
  { value: "romance", label: "爱情", description: "浪漫情感故事" },
  { value: "scifi", label: "科幻", description: "未来科技故事" },
  { value: "fantasy", label: "奇幻", description: "魔法幻想故事" },
  { value: "horror", label: "恐怖", description: "惊悚恐怖故事" },
  { value: "mystery", label: "悬疑", description: "解谜推理故事" },
];

export const tones = [
  { value: "light", label: "轻松", color: "bg-yellow-500" },
  { value: "neutral", label: "中性", color: "bg-blue-500" },
  { value: "dark", label: "沉重", color: "bg-muted" },
  { value: "epic", label: "史诗", color: "bg-purple-500" },
  { value: "intimate", label: "温馨", color: "bg-pink-500" },
];

export const beatTypes = [
  { value: "scene", label: "场景", color: "bg-blue-500", description: "切换到新场景" },
  { value: "dialogue", label: "对话", color: "bg-green-500", description: "角色之间的对话" },
  { value: "action", label: "动作", color: "bg-orange-500", description: "角色动作或事件" },
  { value: "transition", label: "转场", color: "bg-purple-500", description: "场景过渡效果" },
  { value: "effect", label: "特效", color: "bg-pink-500", description: "视觉或声音特效" },
];
