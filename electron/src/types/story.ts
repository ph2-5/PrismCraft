export interface RawStoryBeat {
  t?: string;
  title?: string;
  c?: string;
  content?: string;
  desc?: string;
  description?: string;
  st?: string;
  shotType?: string;
  ca?: string;
  cameraAngle?: string;
  cm?: string;
  cameraMovement?: string;
  d?: number;
  duration?: number;
  tp?: string;
  type?: string;
  ci?: string[];
  characterIds?: string[];
  si?: string;
  sceneId?: string;
  kp?: string;
  keyframePrompt?: string;
  fp?: string;
  firstFramePrompt?: string;
  lp?: string;
  lastFramePrompt?: string;
  ei?: string[];
  elementIds?: string[];
  eb?: Record<string, unknown>;
  elementBindings?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StoryBeat {
  id?: string;
  title: string;
  content: string;
  description: string;
  shotType: string;
  camera?: { angle?: string; movement?: string };
  duration: number;
  type: string;
  characterIds: string[];
  sceneId?: string;
  keyframePrompt?: string;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
  elementIds?: string[];
  elementBindings?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface StoryPlanValidationResult {
  fixedPlan: StoryBeat[];
  errors: string[];
  autoFixed: string[];
}
