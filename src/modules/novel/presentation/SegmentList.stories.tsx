import type { Meta, StoryObj } from "@storybook/react";
import { SegmentList } from "./SegmentList";
import type { NovelSegment } from "../domain/types";

const meta: Meta<typeof SegmentList> = {
  title: "Novel/SegmentList",
  component: SegmentList,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof SegmentList>;

const baseSegments: NovelSegment[] = [
  {
    id: "seg-1",
    title: "第一章 开端：迷雾森林",
    summary: "少年剑士踏入迷雾森林，遭遇神秘老人的指引，得知王国危机的真相。",
    startChar: 0,
    endChar: 1200,
    estimatedDuration: 95,
    keyEvents: ["遇见神秘老人", "获得传家宝剑", "得知预言"],
    text: "清晨的雾气尚未散去...",
    chapterIndex: 1,
    chapterTitle: "开端",
  },
  {
    id: "seg-2",
    title: "第二章 相遇：同伴集结",
    summary: "在边境小镇遇见法师艾琳与弓手洛克，三人结成冒险小队。",
    startChar: 1200,
    endChar: 2400,
    estimatedDuration: 110,
    keyEvents: ["酒馆冲突", "结成同盟", "夜袭盗贼团"],
    text: "边境小镇灯火通明...",
    chapterIndex: 2,
    chapterTitle: "相遇",
  },
  {
    id: "seg-3",
    title: "第三章 试炼：暗影峡谷",
    summary: "穿越暗影峡谷，面对心魔考验，剑士觉醒血脉之力。",
    startChar: 2400,
    endChar: 3800,
    estimatedDuration: 130,
    keyEvents: ["心魔幻象", "血脉觉醒", "突破峡谷"],
    text: "峡谷风声如泣...",
    chapterIndex: 3,
    chapterTitle: "试炼",
  },
];

export const Default: Story = {
  args: {
    segments: baseSegments,
    selectedIds: ["seg-2"],
    onToggle: (id) => console.debug("toggle", id),
    onSelectAll: () => console.debug("select all"),
  },
};

export const AllSelected: Story = {
  args: {
    segments: baseSegments,
    selectedIds: ["seg-1", "seg-2", "seg-3"],
    onToggle: (id) => console.debug("toggle", id),
    onSelectAll: () => console.debug("select all"),
  },
};

export const NoneSelected: Story = {
  args: {
    segments: baseSegments,
    selectedIds: [],
    onToggle: (id) => console.debug("toggle", id),
    onSelectAll: () => console.debug("select all"),
  },
};

export const Empty: Story = {
  args: {
    segments: [],
    selectedIds: [],
    onToggle: () => {},
    onSelectAll: () => {},
  },
};
