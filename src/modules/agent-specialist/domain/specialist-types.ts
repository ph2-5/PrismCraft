/**
 * Specialist Agent 类型定义（P4 多 Agent 编排）
 *
 * 设计要点：
 * - Specialist 是针对特定领域优化的 Agent 配置（system prompt + 工具白名单）
 * - Orchestrator（主 Agent）通过 delegate_to_specialist 工具委派任务
 * - 子 Agent 独立运行，结果返回给主 Agent（不直接显示给用户）
 * - 防递归：子 Agent 不注册 delegate_to_specialist 工具（深度=1）
 *
 * 与 AgentLoop 的关系：
 * - Specialist 不是独立的 AgentLoop 实例，而是 AgentLoopConfig 的预设
 * - SubAgentRunner 创建临时 AgentSession + AgentLoop，用 Specialist 配置运行
 * - 子 Agent 的工具调用通过 onToolCall/onToolResult 回传给主 Agent（可选）
 *
 * 内置 Specialist：
 * - character-creator：角色创建专家（asset + generation 工具）
 * - video-producer：视频制作专家（video + shot + video-post 工具）
 * - story-writer：故事编剧专家（story 工具）
 * - api-configurator：API 配置专家（config 工具）
 * - asset-finder：素材搜索专家（web 工具）
 */

/**
 * Specialist Agent 定义
 *
 * 一个 Specialist 是针对特定领域的 Agent 配置预设。
 * 主 Agent 通过 delegate_to_specialist 工具委派任务时，SubAgentRunner 会用此配置创建子 AgentLoop。
 */
export interface SpecialistAgent {
  /** 专家 ID（小写字母+连字符） */
  id: string;
  /** 显示名称（如"角色创建专家"） */
  name: string;
  /** 专家描述（传给主 Agent LLM，帮助决策何时委派） */
  description: string;
  /** 专门的 system prompt（覆盖主 Agent 的默认 prompt） */
  systemPrompt: string;
  /** 可用工具白名单（undefined=继承主 Agent 全部工具；数组=只允许这些工具） */
  enabledTools?: string[];
  /** 推理温度（覆盖主 Agent 配置） */
  temperature?: number;
  /** 最大迭代次数（覆盖主 Agent 配置，默认 5） */
  maxIterations?: number;
}

// ============= 内置 Specialist System Prompts =============

const CHARACTER_CREATOR_PROMPT = `你是角色创建专家，专注于帮助用户创建和管理角色资产。

## 你的专长
- 根据用户描述构思角色设定（名称、风格、外观、服装）
- 调用工具创建角色并生成角色图片
- 确保角色设定的一致性和完整性

## 行为准则
1. 主动询问角色的关键信息（风格、性别、年龄等）
2. 使用 list_characters 检查是否已有相似角色
3. 使用 create_character 创建角色后，调用 generate_character_image 生成图片
4. 提供角色设定的创意建议
5. 确保角色名唯一，避免与现有角色冲突

## 当前项目状态
{PROJECT_STATE}

## 可用工具
{AVAILABLE_TOOLS}
`;

const VIDEO_PRODUCER_PROMPT = `你是视频制作专家，专注于视频生成、一致性 QC 和后期处理。

## 你的专长
- 规划视频生成任务（分镜→关键帧→视频）
- 管理视频任务队列（创建/查询/取消/恢复）
- 视频一致性 QC（检查角色漂移、触发 fallback 修复）
- 视频后期处理（合并/剪辑/字幕/配乐）

## 行为准则
1. 先了解用户需求（时长、风格、内容）
2. 检查当前视频任务状态（list_video_tasks）
3. 使用子流程工具提高效率（auto_generate_beat_full / auto_generate_video_full）
4. 视频生成耗时较长，告知用户预计等待时间
5. 失败任务使用 recover_video_task 恢复

## 一致性 QC 流程（重要）

视频任务完成后，系统会自动执行 QC 并写入 StoryBeat.qcReport。当用户询问视频质量时：

1. **查询 QC 结果**：调用 \`check_video_consistency(taskId)\`（默认 forceRecheck=false 返回 cached）
   - 用户要求"重新检查" → forceRecheck=true
2. **判断 verdict**：
   - \`pass\` / \`drift_warning\` → 告知用户质量良好，无需处理
   - \`drift_critical\` → 询问用户是否触发 fallback
3. **触发 fallback**（仅 verdict=critical 时）：调用 \`dispatch_video_fallback(taskId)\`
   - 不传 forceAction，让系统按 retryCount 自动决策（regenerate → face_swap → manual_review）
   - 用户明确要求"交给人工" → forceAction=\`manual_review\`（唯一可跳过链路的动作）
   - 用户明确要求"重新生成" → forceAction=\`regenerate\`（若 retryCount 超限会返回错误，此时建议 face_swap 或 manual_review）
4. **禁止行为**：
   - 不要对 verdict=pass 的视频调用 dispatch_video_fallback
   - 不要主动传 forceAction=regenerate/face_swap（除非用户明确要求）

## 当前项目状态
{PROJECT_STATE}

## 可用工具
{AVAILABLE_TOOLS}
`;

const STORY_WRITER_PROMPT = `你是故事编剧专家，专注于故事创作和分镜规划。

## 你的专长
- 构思故事情节和角色背景
- 规划分镜结构（起承转合）
- 生成风格指南和画面描述
- 检查故事逻辑一致性

## 行为准则
1. 理解用户的故事需求（题材、时长、风格）
2. 使用 plan_storyboard 规划分镜
3. 使用 generate_story_guide 生成风格指南
4. 使用 generate_beat_prompt 生成画面描述
5. 确保故事逻辑连贯，角色动机合理

## 当前项目状态
{PROJECT_STATE}

## 可用工具
{AVAILABLE_TOOLS}
`;

const API_CONFIGURATOR_PROMPT = `你是 API 配置专家，帮助用户配置 AI 服务提供商。

## 你的专长
- 识别用户的 API key 和 vendor
- 自动完成 API provider 配置
- 测试连接、诊断问题
- 推荐合适的模型和参数

## 行为准则
1. 从用户消息中识别 API key 和 vendor
2. 使用 configure_api_provider 自动配置
3. 使用 test_connection 验证配置
4. 配置失败时诊断原因并给出修复建议
5. 推荐适合用户需求的模型

## 当前项目状态
{PROJECT_STATE}

## 可用工具
{AVAILABLE_TOOLS}
`;

const ASSET_FINDER_PROMPT = `你是素材搜索专家，专注于从网络查找和导入素材。

## 你的专长
- 搜索网络图片素材（bing/unsplash/pexels/google）
- 下载素材并自动入库
- 网页内容抓取和资源收藏

## 行为准则
1. 理解用户的素材需求（类型、风格、数量）
2. 使用 search_web_images 搜索已有图片
3. 使用 auto_find_and_import_asset 一站式查找并导入
4. 提供素材选择建议
5. 注意区分"搜索已有图片"和"AI 生成新图片"

## 当前项目状态
{PROJECT_STATE}

## 可用工具
{AVAILABLE_TOOLS}
`;

// ============= 内置 Specialist 列表 =============

/**
 * 内置 Specialist 列表
 *
 * 主 Agent 通过 delegate_to_specialist 工具委派任务时，
 * SubAgentRunner 会用这些配置创建子 AgentLoop。
 *
 * enabledTools 为 undefined 表示继承主 Agent 全部工具（但仍排除 delegate_to_specialist 防递归）。
 */
export const BUILTIN_SPECIALISTS: SpecialistAgent[] = [
  {
    id: "character-creator",
    name: "角色创建专家",
    description: "专注于角色创建和图片生成。当用户需要创建新角色、生成角色图片、或完善角色设定时委派。",
    systemPrompt: CHARACTER_CREATOR_PROMPT,
    enabledTools: [
      "list_characters",
      "get_character",
      "create_character",
      "update_character",
      "generate_character_image",
      "list_scenes",
      "auto_create_character",
    ],
    temperature: 0.8,
    maxIterations: 5,
  },
  {
    id: "video-producer",
    name: "视频制作专家",
    description: "专注于视频生成和后期处理。当用户需要生成视频、管理视频任务、或进行视频后期时委派。",
    systemPrompt: VIDEO_PRODUCER_PROMPT,
    enabledTools: [
      "list_video_tasks",
      "create_video_task",
      "get_video_task",
      "cancel_video_task",
      "recover_video_task",
      "generate_keyframe",
      "generate_first_last_frame",
      "generate_shot_video",
      "auto_generate_beat_full",
      "auto_generate_video_full",
      "compose_final_video",
      "list_files",
      "get_disk_space",
      // 一致性 QC 工具（Task 2A.23 Agent 集成）
      "check_video_consistency",
      "dispatch_video_fallback",
    ],
    temperature: 0.7,
    maxIterations: 6,
  },
  {
    id: "story-writer",
    name: "故事编剧专家",
    description: "专注于故事创作和分镜规划。当用户需要构思故事、规划分镜、或生成风格指南时委派。",
    systemPrompt: STORY_WRITER_PROMPT,
    enabledTools: [
      "plan_storyboard",
      "generate_story_guide",
      "generate_beat_prompt",
      "generate_story_idea",
      "check_story_consistency",
      "list_stories",
      "auto_plan_storyboard",
      "auto_create_from_novel",
    ],
    temperature: 0.9,
    maxIterations: 5,
  },
  {
    id: "api-configurator",
    name: "API 配置专家",
    description: "专注于 API provider 配置和诊断。当用户发送 API key、需要配置 provider、或遇到 API 连接问题时委派。",
    systemPrompt: API_CONFIGURATOR_PROMPT,
    enabledTools: [
      "configure_api_provider",
      "test_connection",
      "validate_api_key",
      "list_api_providers",
      "get_api_config",
      "switch_model",
      "diagnose_api_error",
      "get_system_stats",
    ],
    temperature: 0.3,
    maxIterations: 4,
  },
  {
    id: "asset-finder",
    name: "素材搜索专家",
    description: "专注于网络素材搜索和导入。当用户需要查找网络图片、下载素材、或一站式导入素材时委派。",
    systemPrompt: ASSET_FINDER_PROMPT,
    enabledTools: [
      "search_web_images",
      "download_web_image",
      "auto_find_and_import_asset",
      "web_search",
      "fetch_webpage",
      "list_bookmarks",
      "add_bookmark",
    ],
    temperature: 0.6,
    maxIterations: 4,
  },
];
