import type { Character, CharacterAppearance } from "@/domain/schemas/character";
import type { Scene } from "@/domain/schemas/scene";
import type { Story, StoryBeat, ElementBinding } from "@/domain/schemas/story";
import type { VideoTask, VideoTaskStatus } from "@/domain/schemas/api";
import type { StoryElement, ShotInstruction, FeatureAnchoringConfig, ConsistencyCheckResult, AssetBinding } from "@/domain/schemas/shot-system";

let idCounter = 0;
function nextId(prefix = "id") {
  return `${prefix}_${++idCounter}_${Date.now()}`;
}

export const integrationFactories = {
  characterAppearance: (overrides: Partial<CharacterAppearance> = {}): CharacterAppearance => ({
    hairColor: "黑色",
    hairStyle: "短发",
    eyeColor: "棕色",
    height: "170cm",
    build: "中等",
    clothing: "蓝色外套",
    ...overrides,
  }),

  character: (overrides: Partial<Character> = {}): Character => ({
    id: nextId("char"),
    name: "测试角色",
    description: "一位穿着蓝色外套的年轻人",
    gender: "男",
    style: "写实",
    personality: ["勇敢", "聪明"],
    appearance: integrationFactories.characterAppearance(),
    prompt: "测试提示词",
    ...overrides,
  }),

  scene: (overrides: Partial<Scene> = {}): Scene => ({
    id: nextId("scene"),
    name: "测试场景",
    description: "一个明亮的室内场景",
    type: "室内",
    timeOfDay: "白天",
    weather: "晴朗",
    mood: "平静",
    lighting: "自然光",
    elements: [],
    colors: ["蓝色", "白色"],
    prompt: "测试场景提示词",
    ...overrides,
  }),

  story: (overrides: Partial<Story> = {}): Story => ({
    id: nextId("story"),
    title: "测试故事",
    description: "一个关于冒险的故事",
    characters: [],
    scenes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    beats: [],
    elementIds: [],
    ...overrides,
  }),

  storyBeat: (overrides: Partial<StoryBeat> = {}): StoryBeat => ({
    id: nextId("beat"),
    sequence: 1,
    title: "开场",
    content: "角色走进房间",
    description: "角色走进房间，环顾四周",
    duration: 5,
    type: "action",
    shotType: "medium",
    characterIds: [],
    elementIds: [],
    camera: { angle: "eye_level", movement: "static" },
    enhancedGeneration: false,
    ...overrides,
  }),

  elementBinding: (overrides: Partial<AssetBinding> = {}): AssetBinding => ({
    type: "image",
    url: "https://example.com/ref.jpg",
    name: "参考图",
    uploadedAt: new Date().toISOString(),
    isPrimary: true,
    ...overrides,
  }),

  beatElementBinding: (overrides: Partial<ElementBinding> = {}): ElementBinding => ({
    role: "main_character",
    action: "站立",
    position: "中央",
    emotion: "平静",
    description: "主角站在画面中央",
    ...overrides,
  }),

  storyElement: (overrides: Partial<StoryElement> = {}): StoryElement => ({
    id: nextId("elem"),
    type: "character",
    name: "测试元素",
    description: "一个测试用的角色元素",
    bindings: [integrationFactories.elementBinding()],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  shotInstruction: (overrides: Partial<ShotInstruction> = {}): ShotInstruction => ({
    shotSize: "medium",
    cameraMovement: "push",
    cameraAngle: "eye_level",
    ...overrides,
  }),

  featureAnchoring: (overrides: Partial<FeatureAnchoringConfig> = {}): FeatureAnchoringConfig => ({
    enabled: true,
    characterAnchors: [],
    disableFrameBinding: true,
    featureConsistencyStrength: 0.8,
    ...overrides,
  }),

  consistencyCheckResult: (overrides: Partial<ConsistencyCheckResult> = {}): ConsistencyCheckResult => ({
    passed: true,
    characterScores: [],
    overallScore: 1.0,
    recommendation: "accept",
    ...overrides,
  }),

  videoTask: (overrides: Partial<VideoTask> = {}): VideoTask => ({
    taskId: nextId("vtask"),
    status: "pending" as VideoTaskStatus,
    progress: 0,
    message: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  validStoryPlanJSON(): Record<string, unknown>[] {
    return [
      {
        t: "开场",
        c: "角色走进房间，环顾四周，表情紧张",
        st: "medium",
        ca: "eye_level",
        cm: "static",
        d: 5,
        tp: "action",
        ci: ["char_001"],
        si: "scene_001",
        kp: "角色站在房间门口，光线从窗户照入",
        fp: "角色正面特写，表情紧张",
        lp: "角色转身面对镜头",
      },
      {
        t: "发现",
        c: "角色发现桌上的信封，小心翼翼地拿起",
        st: "close",
        ca: "high",
        cm: "push",
        d: 4,
        tp: "action",
        ci: ["char_001"],
        si: "scene_001",
        kp: "桌上的信封特写",
        fp: "手伸向信封的特写",
      },
    ];
  },

  validStoryPlanText(): string {
    return JSON.stringify(integrationFactories.validStoryPlanJSON());
  },

  resetIdCounter() {
    idCounter = 0;
  },
};
