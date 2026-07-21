import type { Character, CharacterOutfit } from "@/domain/schemas/character";
import type { Scene } from "@/domain/schemas/scene";
import type { Story, StoryBeat, ElementBinding, BeatCamera, PromptLab } from "@/domain/schemas/story";
import type { VideoTask } from "@/domain/schemas/api";
import type { StoryElement, ShotInstruction, FeatureAnchoringConfig, ConsistencyCheckResult, ShotReference } from "@/domain/schemas/shot-system";

let idCounter = 0;
function nextId(prefix = "id") {
  return `${prefix}_${++idCounter}_${Date.now()}`;
}

export const factories = {
  character: (overrides: Partial<Character> = {}): Character => ({
    id: nextId("char"),
    name: "测试角色",
    description: "自动生成的测试角色",
    gender: "未知",
    style: "写实",
    personality: [],
    appearance: {
      hairColor: "",
      hairStyle: "",
      eyeColor: "",
      height: "",
      build: "",
      clothing: "",
    },
    prompt: "测试提示词",
    ...overrides,
  }),

  characterOutfit: (overrides: Partial<CharacterOutfit> = {}): CharacterOutfit => ({
    id: nextId("outfit"),
    name: "默认服装",
    description: "测试服装",
    clothing: "休闲装",
    accessories: [],
    isDefault: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  scene: (overrides: Partial<Scene> = {}): Scene => ({
    id: nextId("scene"),
    name: "测试场景",
    description: "自动生成的测试场景",
    type: "室内",
    timeOfDay: "白天",
    weather: "晴朗",
    mood: "平静",
    lighting: "自然光",
    elements: [],
    colors: [],
    prompt: "测试提示词",
    ...overrides,
  }),

  story: (overrides: Partial<Story> = {}): Story => ({
    id: nextId("story"),
    title: "测试故事",
    description: "自动生成的测试故事",
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
    sequence: 0,
    description: "测试节拍描述",
    duration: 5,
    characterIds: [],
    elementIds: [],
    enhancedGeneration: false,
    ...overrides,
  }),

  elementBinding: (overrides: Partial<ElementBinding> = {}): ElementBinding => ({
    role: "主角",
    position: "中央",
    action: "站立",
    emotion: "平静",
    description: "测试元素绑定",
    ...overrides,
  }),

  beatCamera: (overrides: Partial<BeatCamera> = {}): BeatCamera => ({
    // PR 7：angle/movement 已从 beatCameraSchema 删除，只保留 distance/speed 等独有字段
    distance: "medium",
    speed: "normal",
    ...overrides,
  }),

  shotInstruction: (overrides: Partial<ShotInstruction> = {}): ShotInstruction => ({
    shotSize: "medium",
    cameraMovement: "static",
    cameraAngle: "eye_level",
    ...overrides,
  }),

  shotReference: (overrides: Partial<ShotReference> = {}): ShotReference => ({
    direction: "none",
    contentType: "last_frame",
    ...overrides,
  }),

  featureAnchoring: (overrides: Partial<FeatureAnchoringConfig> = {}): FeatureAnchoringConfig => ({
    enabled: false,
    characterAnchors: [],
    disableFrameBinding: true,
    featureConsistencyStrength: 0.5,
    ...overrides,
  }),

  consistencyCheckResult: (overrides: Partial<ConsistencyCheckResult> = {}): ConsistencyCheckResult => ({
    passed: true,
    characterScores: [],
    overallScore: 1.0,
    recommendation: "accept",
    ...overrides,
  }),

  storyElement: (overrides: Partial<StoryElement> = {}): StoryElement => ({
    id: nextId("elem"),
    type: "character",
    name: "测试元素",
    description: "自动生成的测试元素",
    bindings: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  promptLab: (overrides: Partial<PromptLab> = {}): PromptLab => ({
    coreElements: "测试核心元素",
    cameraAction: "静态镜头",
    styleAtmosphere: "写实风格",
    ...overrides,
  }),

  videoTask: (overrides: Partial<VideoTask> = {}): VideoTask => ({
    taskId: nextId("vtask"),
    status: "pending",
    progress: 0,
    message: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  resetIdCounter() {
    idCounter = 0;
  },
};
