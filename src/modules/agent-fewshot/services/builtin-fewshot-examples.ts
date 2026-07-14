/**
 * 内置 Few-Shot 示例库（预训练数据补充）
 *
 * 目标：为 Agent 提供开箱即用的工具调用示例，覆盖角色/场景/视频/故事/提示词模板
 * 等核心场景。与运行时 fewshot-cache（从用户历史学习）互补：
 * - 内置示例：新用户首次使用时即可用，覆盖典型用例
 * - 运行时缓存：从用户实际成功调用中学习，更贴近用户习惯
 *
 * 使用方式：
 * - getRelevantFewShots() / buildFewShotPrompt() 会自动合并内置 + 运行时示例
 * - 内置示例不写入磁盘，仅内存常驻
 * - 每个 domain 5-10 个示例，覆盖常见参数组合
 *
 * 示例来源：基于项目工具定义的实际参数 schema 编写，确保参数格式正确
 *
 * 从 @/modules/agent/services/ 迁移至 @/modules/agent-fewshot（阶段2-c）
 */

import type { FewShotEntry } from "../domain/types";

/** 内置示例的固定时间戳（早于任何运行时缓存，确保检索时优先级低于运行时缓存） */
const BUILTIN_TIMESTAMP = 0;

/**
 * 内置 Few-Shot 示例列表
 *
 * 覆盖 5 个 domain：character / scene / video / story / prompt-template
 * 每个示例包含：用户意图、正确参数、典型成功结果
 */
export const BUILTIN_FEWSHOT_EXAMPLES: FewShotEntry[] = [
  // ============= 角色 domain（10 个） =============
  {
    toolName: "list_characters",
    userQuery: "列出所有角色",
    argsSummary: '{"limit":20,"offset":0}',
    resultSummary: '{"items":[{"id":"char_001","name":"李小白","style":"wuxia"}],"total":1}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "list_characters",
    userQuery: "查看武侠风格的角色",
    argsSummary: '{"limit":20,"search":"武侠"}',
    resultSummary: '{"items":[{"id":"char_002","name":"剑客"}],"total":1}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "get_character",
    userQuery: "查看这个角色的详细信息",
    argsSummary: '{"characterId":"char_001"}',
    resultSummary: '{"id":"char_001","name":"李小白","description":"少年剑客","style":"wuxia"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "create_character",
    userQuery: "创建一个新角色：少女法师",
    argsSummary: '{"name":"林月华","description":"16岁少女法师，擅长冰系法术","gender":"female","style":"fantasy","age":16}',
    resultSummary: '{"id":"char_new_1","name":"林月华","createdAt":1700000000000}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "update_character",
    userQuery: "修改角色的描述",
    argsSummary: '{"characterId":"char_001","updates":{"description":"青年剑客，性格沉稳"}}',
    resultSummary: '{"id":"char_001","name":"李小白","updatedAt":1700000000000}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_character_image",
    userQuery: "为这个角色生成一张图片",
    argsSummary: '{"characterId":"char_001","size":"portrait_4_3"}',
    resultSummary: '{"success":true,"taskId":"img_task_001","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_character_image",
    userQuery: "用动漫风格重新生成角色头像",
    argsSummary: '{"characterId":"char_001","style":"anime","size":"square"}',
    resultSummary: '{"success":true,"taskId":"img_task_002","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_character_image",
    userQuery: "用自定义提示词生成角色图",
    argsSummary: '{"characterId":"char_001","customPrompt":"anime style, silver hair, blue eyes, traditional chinese clothing, cherry blossoms background","size":"portrait_16_9"}',
    resultSummary: '{"success":true,"taskId":"img_task_003","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "delete_character",
    userQuery: "删除这个角色",
    argsSummary: '{"characterId":"char_002"}',
    resultSummary: '{"success":true,"deletedId":"char_002"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "search_assets",
    userQuery: "搜索素材",
    argsSummary: '{"keyword":"剑客","type":"character","limit":10}',
    resultSummary: '{"items":[{"id":"char_001","name":"李小白"}],"total":1}',
    timestamp: BUILTIN_TIMESTAMP,
  },

  // ============= 场景 domain（8 个） =============
  {
    toolName: "list_scenes",
    userQuery: "列出所有场景",
    argsSummary: '{"limit":20,"offset":0}',
    resultSummary: '{"items":[{"id":"scene_001","name":"竹林"}],"total":1}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "list_scenes",
    userQuery: "查看夜景场景",
    argsSummary: '{"limit":20,"search":"夜景"}',
    resultSummary: '{"items":[{"id":"scene_002","name":"夜晚街道"}],"total":1}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "get_scene",
    userQuery: "查看场景详情",
    argsSummary: '{"sceneId":"scene_001"}',
    resultSummary: '{"id":"scene_001","name":"竹林","description":"幽静的竹林","type":"nature"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "create_scene",
    userQuery: "创建一个新场景：山顶日出",
    argsSummary: '{"name":"山顶日出","description":"黎明时分，太阳从云海中升起","type":"nature","timeOfDay":"dawn","weather":"clear","mood":"epic"}',
    resultSummary: '{"id":"scene_new_1","name":"山顶日出","createdAt":1700000000000}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "update_scene",
    userQuery: "修改场景的天气",
    argsSummary: '{"sceneId":"scene_001","updates":{"weather":"foggy"}}',
    resultSummary: '{"id":"scene_001","name":"竹林","updatedAt":1700000000000}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_scene_image",
    userQuery: "为这个场景生成一张图片",
    argsSummary: '{"sceneId":"scene_001","size":"landscape_16_9"}',
    resultSummary: '{"success":true,"taskId":"img_scene_001","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_scene_image",
    userQuery: "用赛博朋克风格生成场景图",
    argsSummary: '{"sceneId":"scene_002","style":"cyberpunk","size":"landscape_16_9"}',
    resultSummary: '{"success":true,"taskId":"img_scene_002","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "delete_scene",
    userQuery: "删除这个场景",
    argsSummary: '{"sceneId":"scene_002"}',
    resultSummary: '{"success":true,"deletedId":"scene_002"}',
    timestamp: BUILTIN_TIMESTAMP,
  },

  // ============= 视频 domain（10 个） =============
  {
    toolName: "create_video_task",
    userQuery: "生成一段视频：少女在樱花树下奔跑",
    argsSummary: '{"prompt":"anime girl running under cherry blossom trees, flowing hair, dynamic motion, soft pink petals falling, golden hour lighting"}',
    resultSummary: '{"success":true,"taskId":"vid_task_001","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "create_video_task",
    userQuery: "用首帧图片生成视频",
    argsSummary: '{"prompt":"camera slowly zooms in, character turns around, wind blowing hair","firstFrameUrl":"file:///path/to/first.png"}',
    resultSummary: '{"success":true,"taskId":"vid_task_002","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "create_video_task",
    userQuery: "用首尾帧生成视频，5秒时长",
    argsSummary: '{"prompt":"smooth transition between two poses, character walks forward","firstFrameUrl":"file:///path/to/first.png","lastFrameUrl":"file:///path/to/last.png","duration":5}',
    resultSummary: '{"success":true,"taskId":"vid_task_003","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "create_video_task",
    userQuery: "为指定角色和场景生成视频",
    argsSummary: '{"prompt":"character walks through the scene, cinematic tracking shot","characterRef":"char_001","sceneRef":"scene_001","duration":8}',
    resultSummary: '{"success":true,"taskId":"vid_task_004","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "list_video_tasks",
    userQuery: "查看所有视频任务",
    argsSummary: '{"limit":20,"status":"all"}',
    resultSummary: '{"items":[{"id":"vid_task_001","status":"completed"}],"total":1}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "list_video_tasks",
    userQuery: "查看正在生成的视频",
    argsSummary: '{"limit":10,"status":"running"}',
    resultSummary: '{"items":[],"total":0}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "get_video_task",
    userQuery: "查看视频任务详情",
    argsSummary: '{"taskId":"vid_task_001"}',
    resultSummary: '{"id":"vid_task_001","status":"completed","videoUrl":"file:///path/to/video.mp4"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "query_video_status",
    userQuery: "查看视频生成进度",
    argsSummary: '{"taskId":"vid_task_001"}',
    resultSummary: '{"id":"vid_task_001","status":"running","progress":65}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "cancel_video_task",
    userQuery: "取消视频生成任务",
    argsSummary: '{"taskId":"vid_task_002"}',
    resultSummary: '{"success":true,"cancelledId":"vid_task_002"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_beat_video",
    userQuery: "为分镜生成视频",
    argsSummary: '{"beatId":"beat_001","storyId":"story_001"}',
    resultSummary: '{"success":true,"taskId":"vid_beat_001","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },

  // ============= 故事 domain（8 个） =============
  {
    toolName: "create_story",
    userQuery: "创建一个新故事",
    argsSummary: '{"title":"竹林剑影","description":"少年剑客在竹林中遇到神秘老人的故事","targetDuration":60,"style":"wuxia"}',
    resultSummary: '{"id":"story_new_1","title":"竹林剑影","createdAt":1700000000000}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "create_story",
    userQuery: "创建故事并关联角色和场景",
    argsSummary: '{"title":"都市奇遇","description":"现代都市背景的奇幻故事","characters":["char_001","char_002"],"scenes":["scene_001"],"targetDuration":120,"style":"fantasy"}',
    resultSummary: '{"id":"story_new_2","title":"都市奇遇","createdAt":1700000000000}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_story_ideas",
    userQuery: "给我一些故事灵感",
    argsSummary: '{"theme":"武侠","count":3}',
    resultSummary: '{"ideas":["竹林剑影","雪山论剑","江南烟雨"],"count":3}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_story_ideas",
    userQuery: "基于赛博朋克风格生成故事点子",
    argsSummary: '{"theme":"cyberpunk","count":5}',
    resultSummary: '{"ideas":["霓虹追猎","数据幽灵","机械之心"],"count":3}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_frame_prompts",
    userQuery: "为故事生成分镜提示词",
    argsSummary: '{"storyId":"story_001","beatCount":6}',
    resultSummary: '{"prompts":["wide shot of bamboo forest","close up of young swordsman","mysterious old man appears"],"count":3}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_style_guide",
    userQuery: "生成风格指南",
    argsSummary: '{"storyId":"story_001","style":"wuxia"}',
    resultSummary: '{"styleGuide":"ink painting aesthetic, muted colors, flowing brush strokes"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_beat_keyframe",
    userQuery: "为分镜生成关键帧",
    argsSummary: '{"beatId":"beat_001","storyId":"story_001"}',
    resultSummary: '{"success":true,"taskId":"kf_task_001","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "generate_beat_frame_pair",
    userQuery: "生成分镜的首尾帧",
    argsSummary: '{"beatId":"beat_002","storyId":"story_001"}',
    resultSummary: '{"success":true,"taskId":"fp_task_001","status":"pending"}',
    timestamp: BUILTIN_TIMESTAMP,
  },

  // ============= 提示词模板 domain（6 个） =============
  {
    toolName: "list_prompt_templates",
    userQuery: "列出所有提示词模板",
    argsSummary: '{}',
    resultSummary: '{"items":[{"id":"builtin_video_01","name":"仙侠御剑飞行","category":"video"}],"total":24}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "list_prompt_templates",
    userQuery: "查看视频类提示词模板",
    argsSummary: '{"category":"video"}',
    resultSummary: '{"items":[{"id":"builtin_video_01","name":"仙侠御剑飞行"}],"total":10}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "search_prompt_templates",
    userQuery: "搜索赛博朋克相关模板",
    argsSummary: '{"keyword":"cyberpunk"}',
    resultSummary: '{"items":[{"id":"builtin_video_09","name":"赛博朋克都市"}],"total":3}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "search_prompt_templates",
    userQuery: "查找动漫风格的角色模板",
    argsSummary: '{"category":"character","styleTags":["anime"]}',
    resultSummary: '{"items":[{"id":"builtin_char_01","name":"动漫立绘"}],"total":1}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "apply_prompt_template",
    userQuery: "应用模板生成提示词",
    argsSummary: '{"templateId":"builtin_video_01","variables":{"character.name":"李小白","scene.weather":"晴朗"}}',
    resultSummary: '{"prompt":"anime style, Li Xiaobai flying on sword...","missingVariables":[]}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "create_prompt_template",
    userQuery: "创建自定义提示词模板",
    argsSummary: '{"name":"我的角色模板","description":"自定义动漫角色模板","category":"character","target":"image","content":"anime style, {{character.name}}, {{character.outfit}}"}',
    resultSummary: '{"id":"user_1700000000000_abc123","name":"我的角色模板"}',
    timestamp: BUILTIN_TIMESTAMP,
  },

  // ============= 其他常用工具（4 个） =============
  {
    toolName: "list_templates",
    userQuery: "查看有哪些项目模板",
    argsSummary: '{"limit":20}',
    resultSummary: '{"items":[{"id":"ast_001","name":"武侠短片"}],"total":1}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "apply_template",
    userQuery: "应用模板到当前项目",
    argsSummary: '{"templateId":"ast_001"}',
    resultSummary: '{"applied":true,"createdCharacters":["char_new"],"createdStory":"story_new"}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "get_api_config",
    userQuery: "查看当前的 API 配置",
    argsSummary: '{}',
    resultSummary: '{"providers":[{"id":"openai","name":"OpenAI","configured":true}]}',
    timestamp: BUILTIN_TIMESTAMP,
  },
  {
    toolName: "check_api_health",
    userQuery: "检查 API 连接状态",
    argsSummary: '{}',
    resultSummary: '{"healthy":true,"latency":120}',
    timestamp: BUILTIN_TIMESTAMP,
  },
];

/**
 * 获取所有内置 Few-Shot 示例
 *
 * 返回副本，避免外部修改影响内置数据
 */
export function getBuiltinFewShotExamples(): FewShotEntry[] {
  return BUILTIN_FEWSHOT_EXAMPLES.map((e) => ({ ...e }));
}

/**
 * 按工具名筛选内置示例
 *
 * @param toolName 工具名
 * @param limit 返回条数上限
 */
export function getBuiltinFewShotsByTool(
  toolName: string,
  limit = 3,
): FewShotEntry[] {
  return BUILTIN_FEWSHOT_EXAMPLES.filter((e) => e.toolName === toolName)
    .slice(0, limit)
    .map((e) => ({ ...e }));
}

/**
 * 根据用户查询检索相关内置示例（关键词匹配）
 *
 * 与 tool-fewshot-cache.ts 中的 getRelevantFewShots 逻辑一致
 *
 * @param userQuery 用户查询
 * @param limit 返回条数上限
 */
export function getRelevantBuiltinFewShots(
  userQuery: string,
  limit = 3,
): FewShotEntry[] {
  const keywords = extractKeywords(userQuery);
  if (keywords.length === 0) {
    // 无关键词时返回前 limit 个示例（按工具名分组采样）
    const sampled: FewShotEntry[] = [];
    const seenTools = new Set<string>();
    for (const entry of BUILTIN_FEWSHOT_EXAMPLES) {
      if (!seenTools.has(entry.toolName)) {
        sampled.push({ ...entry });
        seenTools.add(entry.toolName);
      }
      if (sampled.length >= limit) break;
    }
    return sampled;
  }

  // 计算匹配度
  const scored: Array<{ entry: FewShotEntry; score: number }> = [];
  for (const entry of BUILTIN_FEWSHOT_EXAMPLES) {
    const text = `${entry.userQuery} ${entry.argsSummary}`;
    const score = scoreMatch(text, keywords);
    if (score > 0) {
      scored.push({ entry: { ...entry }, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

/**
 * 获取内置示例统计信息
 */
export function getBuiltinFewShotStats(): {
  totalEntries: number;
  toolCount: number;
  tools: string[];
} {
  const tools = new Set<string>();
  for (const entry of BUILTIN_FEWSHOT_EXAMPLES) {
    tools.add(entry.toolName);
  }
  return {
    totalEntries: BUILTIN_FEWSHOT_EXAMPLES.length,
    toolCount: tools.size,
    tools: Array.from(tools).sort(),
  };
}

// ── 辅助函数（与 tool-fewshot-cache.ts 保持一致） ──

function extractKeywords(text: string): string[] {
  if (!text) return [];
  const keywords = new Set<string>();

  const englishWords = text.match(/[a-zA-Z]{2,}/g);
  if (englishWords) {
    for (const w of englishWords) {
      keywords.add(w.toLowerCase());
    }
  }

  const chineseSegments = text.match(/[\u4e00-\u9fa5]{2,}/g);
  if (chineseSegments) {
    for (const seg of chineseSegments) {
      keywords.add(seg);
    }
  }

  return Array.from(keywords);
}

function scoreMatch(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      score += 1;
    }
  }
  return score;
}
