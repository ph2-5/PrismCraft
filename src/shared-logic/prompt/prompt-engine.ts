const QUALITY_TAGS_IMAGE: string[] = [
  "masterpiece",
  "best quality",
  "highly detailed",
  "sharp focus",
  "professional",
  "8k",
];

const QUALITY_TAGS_VIDEO: string[] = [
  "masterpiece",
  "best quality",
  "cinematic",
  "smooth motion",
  "consistent lighting",
  "no distortion",
  "professional grade",
];

function joinParts(parts: (string | undefined | null)[]): string {
  return (parts.filter(Boolean) as string[]).join("，");
}

interface CharacterDesc {
  gender?: string;
  age?: number | string;
  style?: string;
  appearance?: {
    hairColor?: string;
    hairStyle?: string;
    eyeColor?: string;
    clothing?: string;
  };
  description?: string;
}

function buildCharacterFullDesc(c: CharacterDesc): string {
  const parts: string[] = [];
  if (c.gender) parts.push(c.gender);
  if (c.age) parts.push(`${c.age}岁`);
  if (c.style) parts.push(`${c.style}风格`);
  if (c.appearance) {
    const app = c.appearance;
    if (app.hairColor) parts.push(`${app.hairColor}发`);
    if (app.hairStyle) parts.push(app.hairStyle);
    if (app.eyeColor) parts.push(`${app.eyeColor}眼`);
    if (app.clothing) parts.push(app.clothing);
  }
  if (c.description) parts.push(c.description);
  return parts.join("，");
}

interface SceneDesc {
  timeOfDay?: string;
  weather?: string;
  mood?: string;
  atmosphere?: string;
  lighting?: string;
  type?: string;
  elements?: string | string[];
  colors?: string | string[];
}

function buildSceneAtmosphereDesc(s: SceneDesc): string {
  const parts: string[] = [];
  if (s.timeOfDay) parts.push(s.timeOfDay);
  if (s.weather) parts.push(s.weather);
  if (s.mood) parts.push(s.mood);
  if (s.atmosphere) parts.push(s.atmosphere);
  if (s.lighting) parts.push(`${s.lighting}光线`);
  return parts.join("，");
}

function buildSceneVisualDesc(s: SceneDesc): string {
  const parts: string[] = [];
  if (s.type) parts.push(s.type);
  if (s.elements) {
    let els: string | string[] = [];
    try {
      els = typeof s.elements === "string" ? JSON.parse(s.elements) : s.elements;
    } catch { els = []; }
    if (Array.isArray(els)) parts.push(els.join("、"));
  }
  if (s.colors) {
    let cols: string | string[] = [];
    try {
      cols = typeof s.colors === "string" ? JSON.parse(s.colors) : s.colors;
    } catch { cols = []; }
    if (Array.isArray(cols)) parts.push(`${cols.join("/")}色调`);
  }
  return parts.join("，");
}

const STYLE_KEYWORDS: Record<string, string> = {
  anime: "anime style, japanese animation, vibrant colors, clean lines",
  realistic: "photorealistic, realistic, natural lighting, detailed texture",
  "3d": "3D render, CGI, volumetric lighting, smooth shading",
  watercolor: "watercolor painting, soft edges, artistic, flowing colors",
  oil: "oil painting, rich textures, classical, brush strokes",
  sketch: "pencil sketch, hand drawn, detailed linework",
  pixel: "pixel art, retro game style, 8-bit",
  cyberpunk: "cyberpunk, neon lights, futuristic, dark atmosphere",
  chinese: "chinese painting style, ink wash, traditional, elegant",
  cartoon: "cartoon style, exaggerated features, bright colors",
};

const SCENE_TYPE_MAP: Record<string, string> = {
  indoor: "indoor scene, interior, enclosed space",
  outdoor: "outdoor scene, exterior, open space",
  urban: "urban environment, city, buildings, streets",
  nature: "natural landscape, mountains, forests, water",
  fantasy: "fantasy world, magical, otherworldly",
  scifi: "science fiction, futuristic, technology",
  historical: "historical setting, period piece, ancient",
  underwater: "underwater scene, aquatic, deep sea",
  space: "outer space, cosmic, stars, planets",
};

const MOOD_MAP: Record<string, string> = {
  happy: "cheerful, bright, warm colors, uplifting",
  sad: "melancholic, muted colors, somber, rain",
  tense: "suspenseful, dark shadows, dramatic lighting",
  peaceful: "serene, calm, soft lighting, gentle",
  epic: "grand, sweeping, majestic, dramatic scale",
  mysterious: "enigmatic, fog, shadows, hidden details",
  romantic: "romantic, warm glow, soft focus, intimate",
  horror: "horror, dark, unsettling, distorted",
};

const LIGHTING_MAP: Record<string, string> = {
  natural: "natural lighting, sunlight, ambient",
  dramatic: "dramatic lighting, high contrast, chiaroscuro",
  soft: "soft lighting, diffused, gentle shadows",
  neon: "neon lighting, colorful glow, urban night",
  golden: "golden hour, warm sunlight, long shadows",
  moonlight: "moonlight, cool blue tones, night",
  candlelight: "candlelight, warm flickering, intimate",
  studio: "studio lighting, professional, even illumination",
};

const SHOT_TYPE_MAP: Record<string, string> = {
  wide: "wide shot, full body visible, establishing shot",
  medium: "medium shot, waist up, balanced framing",
  close: "close-up shot, face and shoulders, intimate",
  extreme_close: "extreme close-up, detailed feature, macro",
  low: "low angle shot, looking up, powerful perspective",
  high: "high angle shot, looking down, overview",
  birdseye: "bird's eye view, top-down, aerial",
  wormseye: "worm's eye view, ground level, dramatic",
};

const CAMERA_MOVEMENT_MAP: Record<string, string> = {
  static: "static camera, locked frame, stable",
  push: "push in, dolly forward, approaching subject",
  pull: "pull out, dolly backward, revealing scene",
  pan: "pan, horizontal rotation, scanning",
  orbit: "orbit, circular movement, 360 degree",
  crane_up: "crane up, rising, ascending",
  crane_down: "crane down, descending, lowering",
  tracking: "tracking shot, following subject, lateral movement",
};

export {
  QUALITY_TAGS_IMAGE,
  QUALITY_TAGS_VIDEO,
  joinParts,
  buildCharacterFullDesc,
  buildSceneAtmosphereDesc,
  buildSceneVisualDesc,
  STYLE_KEYWORDS,
  SCENE_TYPE_MAP,
  MOOD_MAP,
  LIGHTING_MAP,
  SHOT_TYPE_MAP,
  CAMERA_MOVEMENT_MAP,
};
