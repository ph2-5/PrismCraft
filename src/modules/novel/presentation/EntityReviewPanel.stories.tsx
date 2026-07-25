import type { Meta, StoryObj } from "@storybook/react";
import { EntityReviewPanel } from "./EntityReviewPanel";
import type { ExtractedCharacter, ExtractedScene, Segment } from "../domain/types";

const meta: Meta<typeof EntityReviewPanel> = {
  title: "Novel/EntityReviewPanel",
  component: EntityReviewPanel,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof EntityReviewPanel>;

const baseSegments: Segment[] = [
  {
    id: "seg-1",
    title: "第一章 开端",
    summary: "少年剑士踏入迷雾森林。",
    startChar: 0,
    endChar: 1200,
    estimatedDuration: 95,
    keyEvents: ["遇见神秘老人"],
    text: "清晨的雾气尚未散去...",
    chapterIndex: 1,
    chapterTitle: "开端",
  },
  {
    id: "seg-2",
    title: "第二章 相遇",
    summary: "在边境小镇遇见同伴。",
    startChar: 1200,
    endChar: 2400,
    estimatedDuration: 110,
    keyEvents: ["酒馆冲突"],
    text: "边境小镇灯火通明...",
    chapterIndex: 2,
    chapterTitle: "相遇",
  },
];

const baseCharacters: ExtractedCharacter[] = [
  {
    tempId: "char-1",
    name: "艾伦",
    gender: "男",
    age: 17,
    description: "年轻的剑士，传承古老血脉，性格坚毅。",
    appearance: {
      hairColor: "黑色",
      hairStyle: "短发",
      eyeColor: "深蓝",
      height: "175cm",
      build: "匀称",
      clothing: "蓝色铠甲与白色披风",
    },
    personality: ["勇敢", "正义", "冲动"],
    firstAppearance: "第一章 开端",
    status: "new",
    confirmed: false,
    sourceSegmentIds: ["seg-1", "seg-2"],
    chapterIndices: [1, 2],
    appearanceTags: ["少年期"],
  },
  {
    tempId: "char-2",
    name: "艾琳",
    gender: "女",
    age: 20,
    description: "高等法师，冷静睿智，擅长元素魔法。",
    appearance: {
      hairColor: "银色",
      hairStyle: "长发",
      eyeColor: "紫色",
      height: "168cm",
      build: "纤细",
      clothing: "深紫色法袍",
    },
    personality: ["冷静", "睿智", "谨慎"],
    firstAppearance: "第二章 相遇",
    status: "matched",
    matchedCharacterId: "db-char-2",
    matchConfidence: 0.92,
    confirmed: true,
    sourceSegmentIds: ["seg-2"],
    chapterIndices: [2],
    appearanceTags: ["法师形态"],
  },
  {
    tempId: "char-3",
    name: "洛克",
    gender: "男",
    age: 22,
    description: "游侠弓手，神出鬼没，亦正亦邪。",
    appearance: {
      hairColor: "棕色",
      hairStyle: "马尾",
      eyeColor: "绿色",
      height: "180cm",
      build: "精瘦",
      clothing: "皮甲与兜帽",
    },
    personality: ["狡黠", "忠诚", "孤傲"],
    firstAppearance: "第二章 相遇",
    status: "conflict",
    matchedCharacterId: "db-char-3",
    matchConfidence: 0.61,
    confirmed: false,
    sourceSegmentIds: ["seg-2"],
    chapterIndices: [2],
  },
];

const baseScenes: ExtractedScene[] = [
  {
    tempId: "scene-1",
    name: "迷雾森林",
    type: "自然场景",
    description: "古老森林，常年笼罩浓雾，藏有远古遗迹。",
    atmosphere: "神秘、压抑",
    timeOfDay: "清晨",
    location: "王国边境",
    status: "new",
    confirmed: false,
  },
  {
    tempId: "scene-2",
    name: "边境小镇酒馆",
    type: "室内场景",
    description: "喧闹的酒馆，冒险者聚集之地。",
    atmosphere: "热闹、嘈杂",
    timeOfDay: "夜晚",
    location: "边境小镇",
    status: "matched",
    matchedSceneId: "db-scene-2",
    matchConfidence: 0.88,
    confirmed: true,
  },
];

const noopAsync = async () => {};
const noop = () => {};

export const Default: Story = {
  args: {
    characters: baseCharacters,
    scenes: baseScenes,
    segments: baseSegments,
    rawText: "清晨的雾气尚未散去...边境小镇灯火通明...",
    onConfirmCharacter: noop,
    onConfirmScene: noop,
    onEditCharacter: noop,
    onEditScene: noop,
    onMatchCharacter: noop,
    isProcessing: false,
    isExtracting: false,
    progressHint: "",
    dbCharacterNames: ["艾琳", "洛克"],
    dbCharacterCount: 2,
    dbCharacters: [
      { name: "艾琳", tags: ["chapter:2"], traits: ["法师形态"], source: "novel" },
      { name: "洛克", tags: ["chapter:2"], traits: [], source: "novel" },
    ],
    onManualAdd: noopAsync,
    onProgressiveExtract: noopAsync,
    onFullExtract: noopAsync,
    onAddToLibrary: noopAsync,
  },
};

export const Extracting: Story = {
  args: {
    ...Default.args,
    isExtracting: true,
    progressHint: "正在从第 2 章提取角色（3/5）...",
  },
};

export const AllConfirmed: Story = {
  args: {
    ...Default.args,
    characters: baseCharacters.map((c) => ({ ...c, confirmed: true })),
    scenes: baseScenes.map((s) => ({ ...s, confirmed: true })),
  },
};

export const EmptyEntities: Story = {
  args: {
    ...Default.args,
    characters: [],
    scenes: [],
  },
};

export const Processing: Story = {
  args: {
    ...Default.args,
    isProcessing: true,
  },
};
