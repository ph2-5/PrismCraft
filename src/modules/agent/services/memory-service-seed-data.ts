/**
 * 种子记忆数据（Seed Memory Data）
 *
 * 从 memory-service.ts 拆分而来，仅包含静态种子记忆条目定义。
 * 函数实现仍保留在 memory-service.ts 中（依赖 storage 函数）。
 *
 * 设计目的：
 * - 解决 Agent 记忆系统冷启动问题（首次使用归档记忆为空，RAG 检索无结果）
 * - 为 Agent 提供通用动画创作领域知识，提升建议质量
 * - 记录项目工作流程和工具使用最佳实践
 *
 * 实现要点：
 * - 种子记忆 id 以 "seed_" 前缀标识，便于识别和管理
 * - 首次启动时（archival.json 不存在或为空）自动注入
 * - 用户清空归档记忆后不会重新注入（通过 _seedMemoryInjected 标记保护）
 * - 种子记忆与用户记忆共存，遵循统一的容量限制（200 条）
 */

/**
 * 种子记忆条目定义（id 由 ensureSeedMemory 内部统一加 "seed_" 前缀）
 */
export const SEED_MEMORY_ENTRIES: Array<{
  localId: string;
  type: "fact" | "decision" | "summary";
  content: string;
  tags: string[];
}> = [
  {
    localId: "project_overview",
    type: "fact",
    content:
      "本项目是 AI 动画创作工作站，核心能力包括：角色管理（创建/编辑/绑定）、场景管理（背景/环境）、故事分镜（beat-based 结构）、视频生成（多模型支持）、Agent 助手（工具调用 + 记忆系统）。工作流程通常为：导入小说 → 拆分故事 beat → 生成角色/场景 → 生成镜头 → 生成视频。",
    tags: ["project", "overview", "workflow"],
  },
  {
    localId: "character_design_principles",
    type: "fact",
    content:
      "角色设计原则：1) 主角应有鲜明视觉特征（发型/服装/配色），便于 AI 生成一致性；2) 为每个角色绑定参考图，提升跨镜头一致性；3) 角色描述包含身高、体型、发型、瞳色、服装、配饰 6 个维度；4) 配角可简化描述，但需有辨识度；5) 角色关系图应在故事分镜阶段建立。",
    tags: ["character", "design", "best-practice"],
  },
  {
    localId: "scene_design_principles",
    type: "fact",
    content:
      "场景设计原则：1) 场景应服务于故事氛围，与角色风格统一；2) 包含时间（日/夜）、天气、光照方向 3 个维度；3) 复杂场景建议拆分为多个子场景（如『客厅-白天』和『客厅-夜晚』）；4) 场景参考图应包含整体氛围和关键道具；5) 避免场景描述过于抽象，应有具体视觉元素。",
    tags: ["scene", "design", "best-practice"],
  },
  {
    localId: "story_structure",
    type: "fact",
    content:
      "故事结构建议：1) 短视频（<60s）采用三段式：引入-冲突-解决；2) 中等长度（1-3min）可采用起承转合四幕结构；3) 每个 beat 应有明确的视觉焦点和情绪基调；4) beat 之间的过渡应自然，避免突兀切换；5) 角色动机在每个 beat 中应清晰可辨；6) 高潮 beat 应有更详细的镜头描述。",
    tags: ["story", "structure", "narrative"],
  },
  {
    localId: "shot_composition",
    type: "fact",
    content:
      "镜头语言指南：1) 远景建立环境，近景强调情绪，特写突出细节；2) 运镜方式：推（强调）、拉（揭示）、摇（跟随）、移（并行）；3) 角色对话用中景，情绪表达用近景；4) 避免连续多个相同景别，应有节奏变化；5) 关键转折点建议用 Dutch angle 或低角度增强戏剧性；6) 生成视频时首尾帧应明确指定以保持连贯。",
    tags: ["shot", "cinematography", "composition"],
  },
  {
    localId: "video_generation_tips",
    type: "fact",
    content:
      "视频生成最佳实践：1) 优先为首帧和尾帧提供参考图，提升画面连贯性；2) 描述应包含动作、运镜、氛围三层信息；3) 复杂动作拆分为多个短视频片段分别生成；4) 生成失败时检查 API key 配额和模型能力映射；5) 不同 provider 适配不同场景：Kling 适合写实、Pika 适合风格化、Runway 适合运镜；6) 批量生成时建议先测试单个镜头确认风格。",
    tags: ["video", "generation", "best-practice"],
  },
  {
    localId: "agent_tool_usage",
    type: "decision",
    content:
      "Agent 工具使用规范：1) 危险操作（delete_file/move_file/delete_character 等）必须用户确认；2) 文件操作限制在项目目录内，禁止路径遍历；3) 跨模块协作优先使用模块 public API（如 useVideoTaskManager），避免直接操作 Store；4) 长任务（视频生成/批量处理）应使用轮询机制，不阻塞 Agent Loop；5) delegate_to_specialist 用于复杂子任务，子 Agent 权限不超过父 Agent。",
    tags: ["agent", "tool", "permission", "best-practice"],
  },
  {
    localId: "consistency_check",
    type: "fact",
    content:
      "一致性检查要点：1) 角色一致性：跨镜头检查发型、服装、瞳色、体型；2) 场景一致性：同一场景的光照、道具位置应一致；3) 故事一致性：时间线、角色关系、情节逻辑；4) 使用 reference-engine 进行视觉一致性校验；5) 发现不一致时优先调整描述而非重新生成；6) 关键角色建议建立 reference sheet 作为基准。",
    tags: ["consistency", "quality", "reference"],
  },
  {
    localId: "api_config_guide",
    type: "fact",
    content:
      "API 配置指南：1) API key 通过系统级加密存储（macOS Keychain / Windows Credential Manager）；2) 13+ provider 支持：DeepSeek、Kling、Pika、Runway、MiniMax、OpenAI 等；3) 模型能力通过 mapping 配置（text/image/vision/video）；4) 未知模型自动降级到保守默认能力；5) 声明式 JSON 插件可零代码接入新 provider；6) 建议为不同能力配置不同 provider 以优化成本。",
    tags: ["api", "config", "provider"],
  },
  {
    localId: "iteration_workflow",
    type: "decision",
    content:
      "迭代工作流建议：1) 先生成静态画面（角色/场景）确认风格，再生成动态视频；2) 每个 beat 的视频生成后立即检查一致性，问题及时修正；3) 批量处理时保持参数一致（分辨率/时长/风格）；4) 使用项目状态查询工具（get_project_state）跟踪进度；5) 失败任务可通过 video-recovery 恢复；6) 最终成片前进行全局一致性检查。",
    tags: ["workflow", "iteration", "best-practice"],
  },
  {
    localId: "memory_system_guide",
    type: "fact",
    content:
      "记忆系统说明：1) 核心记忆常驻 system prompt，存储用户偏好和项目事实（≤20 条）；2) 归档记忆按需 RAG 检索，存储会话摘要和重要决策（≤200 条）；3) 自动抽取在每 5 条用户消息后触发；4) Embedding 支持 API/本地模型/关键词三策略链；5) 本地 ONNX 模型需手动下载并拖入设置页面；6) 工具调用 few-shot 缓存记录成功调用示例辅助 LLM 决策。",
    tags: ["memory", "system", "agent"],
  },
  {
    localId: "common_pitfalls",
    type: "decision",
    content:
      "常见陷阱与规避：1) 不要在 system prompt 中硬编码项目路径，使用 get_project_state 动态查询；2) 不要直接调用 electronAPI，应通过 file-http 统一层；3) 不要跨模块直接 import Store，使用 public API hook；4) 不要假设模型能力，使用 model-capabilities 查询；5) 不要在 shared-logic 中引入项目依赖，保持零依赖；6) 不要跳过 Zod schema 校验直接调用 API。",
    tags: ["pitfall", "architecture", "best-practice"],
  },
];
