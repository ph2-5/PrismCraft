/**
 * 教学帮助工具（Help Tools）
 *
 * 包含工具：
 * - explain_feature：解释项目功能（"这个按钮是干什么的"）
 * - show_tutorial：显示教程（按主题/级别）
 * - get_help：获取帮助文档（支持搜索/分类）
 * - list_available_commands：列出可用工具/命令（从 toolRegistry 动态获取）
 * - suggest_next_action：建议下一步操作（基于当前项目状态 + LLM 推理）
 * - get_keyboard_shortcuts：获取快捷键列表
 *
 * 设计要点：
 * - 优先从静态字典（FEATURE_DOCS / TUTORIALS / HELP_DOCS / KEYBOARD_SHORTCUTS）返回
 * - 字典中没有的条目，用 container.textProvider 生成（explain_feature / show_tutorial）
 * - list_available_commands 从 toolRegistry 动态获取，不硬编码工具列表
 * - suggest_next_action 查询项目状态（角色/场景/故事/视频任务）后用 textProvider 推理
 * - 所有操作 try/catch，失败时返回友好错误信息
 * - 静态字典内容基于项目实际功能，真实可用
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { toolRegistry } from "../services/tool-registry";
import { container } from "@/infrastructure/di";

// ============= 静态字典 =============

/**
 * 功能说明字典
 * 包含项目各核心功能的详细说明、使用提示、相关功能
 */
const FEATURE_DOCS: Record<
  string,
  { description: string; usageTips: string[]; relatedFeatures: string[] }
> = {
  "shot-page": {
    description:
      "分镜页面是创作视频的核心工作区，您可以在这里规划分镜、生成关键帧、首尾帧和视频。每个分镜对应视频中的一个镜头，支持编辑提示词、绑定角色/场景、调整顺序等操作。",
    usageTips: [
      "点击分镜卡片进入详情编辑，可填写画面描述和镜头指令",
      "拖拽分镜卡片可调整顺序，右键菜单提供复制/删除等操作",
      "在生成面板中选择「关键帧」「首尾帧」「视频」三种生成模式",
      "使用批量生成可一次性为多个分镜生成画面",
    ],
    relatedFeatures: ["story-page", "character-page", "video-generation", "prompt-editor"],
  },
  "character-editor": {
    description:
      "角色编辑器用于创建和管理角色资产。支持设置角色名称、风格、性别、年龄、外观描述、服装等属性，并可绑定参考图用于一致性生成。",
    usageTips: [
      "填写详细的外观描述可提升 AI 生成一致性",
      "上传参考图后，生成画面时会自动引用角色特征",
      "通过标签分类管理角色，便于检索和复用",
      "支持为角色设置多套服装方案",
    ],
    relatedFeatures: ["scene-editor", "shot-page", "video-generation"],
  },
  "scene-editor": {
    description:
      "场景编辑器用于创建和管理场景资产。支持设置场景名称、类型（室内/室外/城市/自然）、时间段、天气、情绪、灯光、镜头等属性，并可添加场景元素。",
    usageTips: [
      "设置时间段和天气可快速奠定画面基调",
      "添加场景元素（如家具、植物）可丰富画面细节",
      "通过情绪标签筛选场景，匹配故事氛围",
      "场景可与角色组合引用，确保画面一致性",
    ],
    relatedFeatures: ["character-editor", "shot-page", "video-generation"],
  },
  "video-generation": {
    description:
      "视频生成功能支持从文本提示词或参考帧生成视频。支持首帧/尾帧引用、角色/场景一致性、时长控制等。生成任务异步执行，可通过任务列表轮询状态。",
    usageTips: [
      "提供首帧图片可让视频从指定画面开始生成",
      "同时提供首尾帧可控制视频的起止画面",
      "视频生成耗时较长（数分钟到数十分钟），请耐心等待",
      "生成失败的任务可通过 recover_video_task 恢复或重试",
    ],
    relatedFeatures: ["shot-page", "api-config", "keyframe-generation"],
  },
  "api-config": {
    description:
      "API 配置页面用于管理 AI 服务提供商的 API 密钥和模型设置。支持配置图像生成、视频生成、文本生成等多个 provider，并可测试连接是否正常。",
    usageTips: [
      "配置 API 密钥后建议点击「测试连接」验证可用性",
      "可为不同 provider 设置不同模型，按需切换",
      "密钥安全存储在本地，不会上传到服务器",
      "如遇生成失败，首先检查 API 配置是否正确",
    ],
    relatedFeatures: ["video-generation", "keyframe-generation", "troubleshooting"],
  },
  "story-page": {
    description:
      "故事页面用于创作和管理故事剧本。支持设置故事标题、类型、基调、主题，并可拆分为多个分镜（beat）。每个分镜可绑定角色和场景，构成完整的故事板。",
    usageTips: [
      "先填写故事基本信息（标题、类型、基调），再拆分分镜",
      "使用故事模板可快速套用经典叙事结构",
      "版本管理功能可保存和恢复故事的不同版本",
      "AI 辅助生成可根据故事大纲自动拆分分镜",
    ],
    relatedFeatures: ["shot-page", "character-page", "beat-editor", "template-manager"],
  },
  "beat-editor": {
    description:
      "分镜编辑器（Beat Editor）用于编辑单个分镜的详细内容。包括画面描述、镜头指令、角色/场景绑定、提示词编辑等。支持专业模式和基础模式切换。",
    usageTips: [
      "基础模式适合快速填写，专业模式提供更多控制选项",
      "绑定角色和场景后，生成画面会自动引用其特征",
      "镜头指令可控制运镜方式（推、拉、摇、移等）",
      "使用元素绑定面板可为分镜添加额外元素",
    ],
    relatedFeatures: ["shot-page", "prompt-editor", "character-editor", "scene-editor"],
  },
  "prompt-editor": {
    description:
      "提示词编辑器用于精细化编辑 AI 生成提示词。支持 AI 辅助优化、变量插入、模板复用等。可针对关键帧、首尾帧、视频分别编辑提示词。",
    usageTips: [
      "点击 AI 优化按钮可自动改进提示词的描述质量",
      "使用变量插入可快速引用角色名、场景名等",
      "保存常用提示词为模板，便于复用",
      "预览功能可在生成前查看最终提示词",
    ],
    relatedFeatures: ["beat-editor", "shot-page", "keyframe-generation"],
  },
  "keyframe-generation": {
    description:
      "关键帧生成功能根据分镜描述生成关键帧图片。支持单帧生成、首尾帧配对生成、批量链式生成等模式。生成的关键帧可作为视频生成的参考帧。",
    usageTips: [
      "单帧生成适合快速预览画面效果",
      "首尾帧配对可控制视频的起止画面，适合有明确运镜需求的场景",
      "链式生成会根据前一帧自动推导下一帧，保证画面连贯",
      "生成不满意可重新生成，不会覆盖已有结果",
    ],
    relatedFeatures: ["video-generation", "frame-pair-generation", "shot-page"],
  },
  "template-manager": {
    description:
      "模板管理器用于创建和管理故事模板。支持从现有分镜创建模板、套用模板到新故事、导入导出模板文件。版本管理功能可追踪故事的修改历史。",
    usageTips: [
      "从优秀故事创建模板，可复用其叙事结构",
      "套用模板后可自由修改分镜内容，不影响原模板",
      "导出模板文件可分享给其他用户",
      "版本管理可随时回滚到之前的故事版本",
    ],
    relatedFeatures: ["story-page", "beat-editor"],
  },
};

/**
 * 教程字典
 * 外层 key 为主题（topic），内层 key 为级别（level）
 */
const TUTORIALS: Record<
  string,
  Record<
    string,
    { steps: Array<{ title: string; description: string; tips?: string[] }>; duration: string }
  >
> = {
  getting_started: {
    beginner: {
      steps: [
        {
          title: "配置 API 密钥",
          description: "进入设置页面，填写 AI 服务提供商的 API 密钥，并测试连接是否正常。",
          tips: ["密钥安全存储在本地", "建议先测试连接再开始创作"],
        },
        {
          title: "创建第一个角色",
          description: "在角色页面点击「新建角色」，填写名称、风格、外观描述等基本信息。",
          tips: ["详细的外观描述有助于提升生成一致性", "可上传参考图作为角色形象"],
        },
        {
          title: "创建第一个场景",
          description: "在场景页面点击「新建场景」，设置场景类型、时间段、天气等属性。",
        },
        {
          title: "创建故事",
          description: "在故事页面新建故事，填写标题和类型，然后拆分为多个分镜。",
          tips: ["可使用故事模板快速套用叙事结构"],
        },
        {
          title: "生成分镜画面",
          description: "进入分镜页面，为每个分镜生成关键帧或视频。",
        },
      ],
      duration: "5 分钟",
    },
    intermediate: {
      steps: [
        {
          title: "理解 CQRS 任务管理",
          description: "视频任务采用 CQRS 模式：状态（State）、查询（Queries）、命令（Commands）、轮询（Polling）分离，便于管理复杂任务。",
        },
        {
          title: "使用批量生成",
          description: "批量生成可一次性为多个分镜生成关键帧或视频，提升创作效率。",
          tips: ["批量任务支持部分失败不影响其他", "可在生成过程中取消"],
        },
        {
          title: "管理资产标签",
          description: "为角色和场景添加标签，便于按标签过滤和检索资产。",
        },
      ],
      duration: "10 分钟",
    },
    advanced: {
      steps: [
        {
          title: "DI 容器与可测试性",
          description: "项目使用 DI 容器管理依赖，支持在测试中替换 Port 实现，确保单元测试隔离。",
        },
        {
          title: "自定义工具与 Agent 集成",
          description: "了解 ToolImpl 接口，注册自定义工具到 toolRegistry，扩展 Agent 能力。",
        },
      ],
      duration: "15 分钟",
    },
  },
  create_character: {
    beginner: {
      steps: [
        { title: "打开角色页面", description: "在侧边栏点击「角色」进入角色管理页面。" },
        { title: "点击新建", description: "点击「新建角色」按钮，打开角色编辑器。" },
        { title: "填写基本信息", description: "输入角色名称、选择风格（如日式动漫、写实）、设置性别和年龄。" },
        { title: "填写外观描述", description: "详细描述角色的外貌特征：发型、眼睛、服装、配饰等。" },
        { title: "保存角色", description: "点击保存，角色将出现在角色列表中。" },
      ],
      duration: "3 分钟",
    },
    intermediate: {
      steps: [
        { title: "上传参考图", description: "为角色上传参考图片，生成画面时会自动引用角色特征。" },
        { title: "设置服装方案", description: "为角色添加多套服装，在不同分镜中可切换。" },
        { title: "添加标签", description: "使用标签分类管理角色，如「主角」「反派」「配角」。" },
      ],
      duration: "5 分钟",
    },
    advanced: {
      steps: [
        { title: "编写专业提示词", description: "在角色提示词字段中编写详细的 AI 生成提示词，精确控制角色形象。" },
        { title: "一致性引用策略", description: "理解 characterRef 机制，在分镜中绑定角色确保跨镜头一致性。" },
      ],
      duration: "8 分钟",
    },
  },
  create_scene: {
    beginner: {
      steps: [
        { title: "打开场景页面", description: "在侧边栏点击「场景」进入场景管理页面。" },
        { title: "点击新建", description: "点击「新建场景」按钮，打开场景编辑器。" },
        { title: "设置场景属性", description: "填写场景名称，选择类型（室内/室外/城市/自然），设置时间段和天气。" },
        { title: "填写场景描述", description: "描述场景的环境细节、氛围、关键元素等。" },
        { title: "保存场景", description: "点击保存，场景将出现在场景列表中。" },
      ],
      duration: "3 分钟",
    },
    intermediate: {
      steps: [
        { title: "配置灯光和相机", description: "设置场景的灯光方向、强度，以及相机角度和焦距。" },
        { title: "添加场景元素", description: "为场景添加家具、植物、装饰物等元素，丰富画面细节。" },
        { title: "设置情绪标签", description: "为场景添加情绪标签（如温馨、紧张、神秘），便于按氛围筛选。" },
      ],
      duration: "5 分钟",
    },
    advanced: {
      steps: [
        { title: "场景一致性引用", description: "理解 sceneRef 机制，在分镜中绑定场景确保跨镜头环境一致。" },
        { title: "组合角色与场景", description: "在同一分镜中同时绑定角色和场景，生成时综合两者的特征。" },
      ],
      duration: "8 分钟",
    },
  },
  create_story: {
    beginner: {
      steps: [
        { title: "打开故事页面", description: "在侧边栏点击「故事」进入故事管理页面。" },
        { title: "新建故事", description: "点击「新建故事」，填写标题、选择类型（如冒险、日常、科幻）和基调。" },
        { title: "填写故事大纲", description: "编写故事简介和主题，作为分镜拆分的依据。" },
        { title: "拆分分镜", description: "将故事拆分为多个分镜（beat），每个分镜对应视频中的一个镜头。" },
        { title: "保存故事", description: "点击保存，故事将出现在故事列表中。" },
      ],
      duration: "5 分钟",
    },
    intermediate: {
      steps: [
        { title: "使用故事模板", description: "套用经典叙事模板（如三幕式、英雄之旅），快速构建故事结构。" },
        { title: "绑定角色和场景", description: "为每个分镜绑定对应的角色和场景，构建完整的故事板。" },
        { title: "编辑分镜提示词", description: "为每个分镜编辑画面描述和镜头指令，精确控制生成效果。" },
      ],
      duration: "8 分钟",
    },
    advanced: {
      steps: [
        { title: "版本管理", description: "使用版本管理功能保存故事的不同版本，可随时回滚和对比。" },
        { title: "AI 辅助拆分", description: "使用 AI 根据故事大纲自动拆分分镜，提升创作效率。" },
        { title: "导入导出模板", description: "将优秀故事导出为模板文件，或导入他人分享的模板。" },
      ],
      duration: "12 分钟",
    },
  },
  generate_video: {
    beginner: {
      steps: [
        { title: "进入分镜页面", description: "打开故事，进入分镜页面，选择要生成视频的分镜。" },
        { title: "选择视频生成模式", description: "在生成面板中选择「视频」模式。" },
        { title: "填写提示词", description: "描述视频中的动作、运镜、氛围等内容。" },
        { title: "提交生成", description: "点击生成按钮，任务将提交到视频 provider。" },
        { title: "等待并查看结果", description: "在任务列表中查看生成状态，完成后可预览视频。" },
      ],
      duration: "5 分钟",
    },
    intermediate: {
      steps: [
        { title: "使用首尾帧", description: "提供首帧和尾帧图片，控制视频的起止画面。" },
        { title: "绑定角色引用", description: "在生成参数中指定角色 ID，确保视频中角色形象一致。" },
        { title: "批量生成", description: "一次性为多个分镜提交视频生成任务，提升效率。" },
      ],
      duration: "8 分钟",
    },
    advanced: {
      steps: [
        { title: "任务恢复与重试", description: "使用 recover_video_task 恢复失败或超时的任务。" },
        { title: "状态轮询与同步", description: "理解 SyncEngine 和轮询机制，管理任务生命周期。" },
        { title: "跨 provider 切换", description: "为不同任务指定不同 provider 和模型，优化生成效果。" },
      ],
      duration: "12 分钟",
    },
  },
  api_config: {
    beginner: {
      steps: [
        { title: "打开设置页面", description: "在侧边栏点击「设置」或使用快捷键打开设置。" },
        { title: "填写 API 密钥", description: "在对应 provider 的输入框中填写 API 密钥。" },
        { title: "选择模型", description: "为图像/视频/文本生成分别选择合适的模型。" },
        { title: "测试连接", description: "点击「测试连接」按钮，验证 API 配置是否正确。" },
      ],
      duration: "3 分钟",
    },
    intermediate: {
      steps: [
        { title: "多 provider 配置", description: "同时配置多个 provider，按需切换使用。" },
        { title: "模型选择策略", description: "不同模型在效果和速度上有差异，根据场景选择合适的模型。" },
      ],
      duration: "5 分钟",
    },
    advanced: {
      steps: [
        { title: "自定义 Vision API", description: "配置自定义 Vision API 端点，用于图像分析等高级功能。" },
        { title: "SSRF 防护", description: "理解 SSRF 防护机制，非本地主机地址需要通过安全校验。" },
      ],
      duration: "8 分钟",
    },
  },
  troubleshooting: {
    beginner: {
      steps: [
        { title: "检查 API 配置", description: "生成失败时，首先检查 API 密钥是否正确、连接是否正常。" },
        { title: "查看错误信息", description: "在任务列表中查看失败任务的错误信息，定位问题原因。" },
        { title: "重试生成", description: "修复问题后，可重试失败的任务。" },
      ],
      duration: "3 分钟",
    },
    intermediate: {
      steps: [
        { title: "日志排查", description: "查看应用日志，定位生成失败、超时等问题的详细原因。" },
        { title: "网络诊断", description: "检查网络连接，确保能正常访问 AI 服务提供商的 API。" },
        { title: "存储检查", description: "检查本地存储空间是否充足，避免因空间不足导致写入失败。" },
      ],
      duration: "5 分钟",
    },
    advanced: {
      steps: [
        { title: "任务恢复", description: "使用 recover_video_task 工具恢复失败/超时的视频任务。" },
        { title: "数据库诊断", description: "使用诊断工具检查数据库完整性，修复损坏的数据。" },
        { title: "性能优化", description: "分析工具执行耗时和 token 使用，优化 Agent 性能。" },
      ],
      duration: "10 分钟",
    },
  },
};

/**
 * 帮助文档字典
 * 包含常见问题的解答和使用指南
 */
const HELP_DOCS: Array<{
  title: string;
  category: string;
  summary: string;
  content: string;
}> = [
  {
    title: "如何创建角色",
    category: "features",
    summary: "创建角色的完整流程，包括基本信息、外观描述、参考图等。",
    content:
      "1. 进入角色页面，点击「新建角色」。\n2. 填写角色名称、选择风格（日式动漫/写实/赛博朋克等）、设置性别和年龄。\n3. 在外观描述中详细填写发型、眼睛、肤色、服装、配饰等特征。\n4. 可选：上传参考图片，生成画面时会自动引用角色特征。\n5. 可选：添加标签分类管理角色。\n6. 点击保存完成创建。\n\n提示：外观描述越详细，AI 生成的一致性越高。",
  },
  {
    title: "如何创建场景",
    category: "features",
    summary: "创建场景的完整流程，包括类型、时间段、天气、灯光等属性。",
    content:
      "1. 进入场景页面，点击「新建场景」。\n2. 填写场景名称，选择类型（室内/室外/城市/自然）。\n3. 设置时间段（白天/黄昏/夜晚）和天气（晴天/雨天/雪天）。\n4. 设置情绪标签（温馨/紧张/神秘）。\n5. 可选：配置灯光方向、强度，以及相机角度和焦距。\n6. 可选：添加场景元素（家具、植物、装饰物）。\n7. 填写场景描述，描述环境细节和氛围。\n8. 点击保存完成创建。",
  },
  {
    title: "如何创建故事",
    category: "features",
    summary: "创建故事并拆分分镜的完整流程。",
    content:
      "1. 进入故事页面，点击「新建故事」。\n2. 填写标题、选择类型（冒险/日常/科幻等）和基调。\n3. 编写故事简介和主题。\n4. 拆分分镜：将故事分解为多个镜头，每个分镜对应视频中的一段画面。\n5. 为每个分镜绑定角色和场景。\n6. 编辑分镜的画面描述和镜头指令。\n7. 可选：使用故事模板快速套用叙事结构。\n8. 点击保存完成创建。",
  },
  {
    title: "如何生成视频",
    category: "features",
    summary: "从分镜生成视频的完整流程，包括提示词、首尾帧、角色引用等。",
    content:
      "1. 进入分镜页面，选择目标分镜。\n2. 在生成面板中选择「视频」模式。\n3. 填写视频提示词，描述动作、运镜、氛围。\n4. 可选：提供首帧/尾帧图片 URL，控制视频起止画面。\n5. 可选：绑定角色 ID 和场景 ID，确保一致性。\n6. 可选：设置视频时长。\n7. 点击生成，任务将异步提交到视频 provider。\n8. 在任务列表中查看状态，完成后可预览。\n\n注意：视频生成耗时较长（数分钟到数十分钟），请耐心等待。",
  },
  {
    title: "如何配置 API",
    category: "features",
    summary: "配置 AI 服务提供商 API 密钥和模型的步骤。",
    content:
      "1. 进入设置页面（侧边栏「设置」或快捷键 Ctrl+,）。\n2. 在对应 provider 区域填写 API 密钥。\n3. 为图像/视频/文本生成分别选择模型。\n4. 点击「测试连接」验证配置是否正确。\n5. 可选：配置多个 provider，按需切换。\n6. 可选：配置自定义 Vision API 端点。\n\n安全提示：密钥安全存储在本地，不会上传到服务器。",
  },
  {
    title: "如何使用分镜页面",
    category: "features",
    summary: "分镜页面的核心操作：编辑、排序、生成、批量操作等。",
    content:
      "分镜页面是创作视频的核心工作区。\n\n基本操作：\n- 点击分镜卡片进入详情编辑\n- 拖拽分镜卡片调整顺序\n- 右键菜单提供复制/删除/粘贴等操作\n\n生成操作：\n- 在生成面板中选择「关键帧」「首尾帧」「视频」三种模式\n- 支持单镜生成和批量生成\n- 生成结果自动关联到对应分镜\n\n绑定操作：\n- 在元素绑定面板中为分镜绑定角色和场景\n- 绑定后生成会自动引用其特征",
  },
  {
    title: "如何使用提示词编辑器",
    category: "features",
    summary: "提示词编辑器的 AI 优化、变量插入、模板复用等功能。",
    content:
      "提示词编辑器用于精细化编辑 AI 生成提示词。\n\n核心功能：\n- AI 优化：点击按钮自动改进提示词描述质量\n- 变量插入：快速引用角色名、场景名等变量\n- 模板复用：保存常用提示词为模板\n- 预览：生成前查看最终提示词\n\n使用场景：\n- 关键帧提示词：描述静态画面\n- 首尾帧提示词：描述起止画面\n- 视频提示词：描述动态画面和运镜",
  },
  {
    title: "如何管理模板",
    category: "features",
    summary: "故事模板的创建、套用、导入导出和版本管理。",
    content:
      "模板管理器用于创建和管理故事模板。\n\n创建模板：\n- 从现有故事创建模板，复用其叙事结构\n- 套用模板后可自由修改分镜内容\n\n导入导出：\n- 导出模板文件（.json）分享给其他用户\n- 导入他人分享的模板文件\n\n版本管理：\n- 保存故事的不同版本\n- 随时回滚到之前的版本\n- 对比不同版本的差异",
  },
  {
    title: "如何批量生成视频",
    category: "features",
    summary: "使用批量生成一次性为多个分镜提交视频任务。",
    content:
      "批量生成可一次性为多个分镜提交视频生成任务。\n\n使用步骤：\n1. 在分镜页面选择多个分镜（Shift+点击多选）\n2. 点击「批量生成」按钮\n3. 选择生成模式（关键帧/首尾帧/视频）\n4. 配置通用参数（provider、模型等）\n5. 点击开始批量生成\n\n特点：\n- 支持部分失败不影响其他任务\n- 生成过程中可取消\n- 任务状态在任务列表中统一查看",
  },
  {
    title: "生成失败怎么办",
    category: "faq",
    summary: "生成任务失败时的排查和恢复步骤。",
    content:
      "生成任务失败的常见原因和解决方案：\n\n1. API 配置错误\n   - 检查 API 密钥是否正确\n   - 点击「测试连接」验证\n\n2. 网络问题\n   - 检查网络连接是否正常\n   - 确认能访问 AI 服务提供商的 API\n\n3. 内容违规\n   - 提示词可能触发内容过滤\n   - 修改提示词后重试\n\n4. 任务超时\n   - 视频生成可能超时\n   - 使用 recover_video_task 恢复\n\n5. 存储空间不足\n   - 检查本地磁盘空间\n   - 清理不需要的文件",
  },
  {
    title: "视频任务一直卡在处理中",
    category: "faq",
    summary: "视频任务状态不更新的排查和解决方法。",
    content:
      "视频任务卡在「处理中」的排查步骤：\n\n1. 检查任务状态\n   - 使用 query_video_status 主动查询 provider 状态\n   - 对比本地状态和 provider 状态\n\n2. 检查轮询引擎\n   - 确认 SyncEngine 正常运行\n   - 查看是否有轮询错误日志\n\n3. 手动恢复\n   - 使用 recover_video_task 工具恢复任务\n   - 可选择重新提交生成\n\n4. 网络问题\n   - 确认网络连接稳定\n   - 检查 provider API 是否可用",
  },
  {
    title: "如何提升生成一致性",
    category: "faq",
    summary: "提升角色/场景跨镜头一致性的技巧。",
    content:
      "提升生成一致性的方法：\n\n1. 角色一致性\n   - 填写详细的外观描述\n   - 上传高质量的参考图\n   - 在分镜中绑定角色 ID（characterRef）\n\n2. 场景一致性\n   - 详细描述场景环境\n   - 在分镜中绑定场景 ID（sceneRef）\n\n3. 风格一致性\n   - 为角色和场景设置相同的风格\n   - 使用统一的提示词模板\n\n4. 链式生成\n   - 使用链式关键帧生成，自动推导下一帧\n   - 保证画面连贯过渡",
  },
  {
    title: "键盘快捷键大全",
    category: "shortcuts",
    summary: "全局、编辑器、分镜页面的常用快捷键。",
    content:
      "全局快捷键：\n- Ctrl+N：新建项目\n- Ctrl+S：保存\n- Ctrl+O：打开\n- Ctrl+Z：撤销\n- Ctrl+Y：重做\n- Ctrl+,：打开设置\n- F11：全屏切换\n\n编辑器快捷键：\n- Ctrl+B：加粗\n- Ctrl+I：斜体\n- Ctrl+D：复制选中项\n- Delete：删除选中项\n- Esc：取消选中/关闭对话框\n\n分镜页面快捷键：\n- Ctrl+Enter：生成\n- Ctrl+Shift+D：复制分镜\n- Ctrl+Up/Down：调整分镜顺序\n- Space：预览",
  },
];

/**
 * 键盘快捷键字典
 */
const KEYBOARD_SHORTCUTS: Array<{ key: string; description: string; context: string }> = [
  // 全局
  { key: "Ctrl+N", description: "新建项目", context: "global" },
  { key: "Ctrl+S", description: "保存当前项目", context: "global" },
  { key: "Ctrl+Shift+S", description: "另存为", context: "global" },
  { key: "Ctrl+O", description: "打开项目", context: "global" },
  { key: "Ctrl+Z", description: "撤销上一步操作", context: "global" },
  { key: "Ctrl+Y", description: "重做撤销的操作", context: "global" },
  { key: "Ctrl+,", description: "打开设置页面", context: "global" },
  { key: "F11", description: "全屏切换", context: "global" },
  { key: "Ctrl+P", description: "打印/导出", context: "global" },
  // 编辑器
  { key: "Ctrl+B", description: "加粗选中文本", context: "editor" },
  { key: "Ctrl+I", description: "斜体选中文本", context: "editor" },
  { key: "Ctrl+D", description: "复制选中项", context: "editor" },
  { key: "Delete", description: "删除选中项", context: "editor" },
  { key: "Ctrl+A", description: "全选", context: "editor" },
  { key: "Esc", description: "取消选中/关闭对话框", context: "editor" },
  { key: "Tab", description: "缩进/切换焦点", context: "editor" },
  // 分镜页面
  { key: "Ctrl+Enter", description: "生成当前分镜", context: "shot_page" },
  { key: "Ctrl+Shift+D", description: "复制当前分镜", context: "shot_page" },
  { key: "Ctrl+Up", description: "上移当前分镜", context: "shot_page" },
  { key: "Ctrl+Down", description: "下移当前分镜", context: "shot_page" },
  { key: "Space", description: "预览分镜画面", context: "shot_page" },
  { key: "Ctrl+Click", description: "多选分镜", context: "shot_page" },
];

// ============= 辅助函数 =============

/** 安全解析 JSON（从文本中提取第一个 JSON 对象或数组） */
function safeParseJson<T>(text: string): T | null {
  try {
    const trimmed = text.trim();
    // 直接尝试解析
    const direct = JSON.parse(trimmed) as T;
    return direct;
  } catch {
    // 尝试从文本中提取 JSON 片段
    try {
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        return JSON.parse(objMatch[0]) as T;
      }
      const arrMatch = text.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        return JSON.parse(arrMatch[0]) as T;
      }
    } catch {
      // ignore
    }
    return null;
  }
}

// ============= 工具实现 =============

/** 解释项目功能 */
export const explainFeatureTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "explain_feature",
      description:
        "解释项目功能（「这个按钮是干什么的」）。根据功能名返回功能说明、使用提示和相关功能。" +
        "支持的功能名如：shot-page（分镜页面）、character-editor（角色编辑器）、scene-editor（场景编辑器）、" +
        "video-generation（视频生成）、api-config（API配置）、story-page（故事页面）等。" +
        "如果功能名不在已知列表中，将基于功能名推测说明。",
      parameters: {
        type: "object",
        properties: {
          featureName: {
            type: "string",
            description: "要解释的功能名（如 shot-page、character-editor、video-generation）",
          },
        },
        required: ["featureName"],
      },
    },
  },
  domain: "help",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const featureName = String(args.featureName || "").trim();
    if (!featureName) {
      return { success: false, error: "featureName 不能为空" };
    }

    // 1. 优先从静态字典查找
    const doc = FEATURE_DOCS[featureName];
    if (doc) {
      return {
        success: true,
        data: {
          feature: featureName,
          description: doc.description,
          usageTips: doc.usageTips,
          relatedFeatures: doc.relatedFeatures,
        },
      };
    }

    // 2. 字典中没有，用 textProvider 生成说明
    try {
      const result = await container.textProvider.generateText(
        `你是 AI 动画工作室的助手。请简要解释 "${featureName}" 功能的用途。返回 JSON 格式：` +
          `{"description":"功能描述（1-2句话）","usageTips":["使用提示1","使用提示2"],"relatedFeatures":["相关功能1","相关功能2"]}` +
          `。只返回 JSON，不要其他内容。`,
        { maxTokens: 500, temperature: 0.3 },
      );

      if (result.success && result.data?.text) {
        const parsed = safeParseJson<{
          description?: string;
          usageTips?: string[];
          relatedFeatures?: string[];
        }>(result.data.text);
        if (parsed) {
          return {
            success: true,
            data: {
              feature: featureName,
              description: parsed.description || "暂无详细说明",
              usageTips: Array.isArray(parsed.usageTips) ? parsed.usageTips : [],
              relatedFeatures: Array.isArray(parsed.relatedFeatures)
                ? parsed.relatedFeatures
                : [],
            },
          };
        }
      }
    } catch {
      // fall through to fallback
    }

    // 3. fallback
    return {
      success: true,
      data: {
        feature: featureName,
        description: `未能找到 "${featureName}" 功能的详细说明。请尝试使用 get_help 工具搜索相关文档，或使用 list_available_commands 查看可用工具。`,
        usageTips: [],
        relatedFeatures: [],
      },
    };
  },
};

/** 显示教程（按主题/级别） */
export const showTutorialTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "show_tutorial",
      description:
        "显示教程（按主题和级别）。返回分步教程步骤列表。" +
        "支持的主题：getting_started（入门）、create_character（创建角色）、create_scene（创建场景）、" +
        "create_story（创建故事）、generate_video（生成视频）、api_config（API配置）、troubleshooting（故障排除）。" +
        "支持的级别：beginner（初级）、intermediate（中级）、advanced（高级）。",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: [
              "getting_started",
              "create_character",
              "create_scene",
              "create_story",
              "generate_video",
              "api_config",
              "troubleshooting",
            ],
            description: "教程主题",
          },
          level: {
            type: "string",
            enum: ["beginner", "intermediate", "advanced"],
            description: "教程级别，默认 beginner",
            default: "beginner",
          },
        },
        required: ["topic"],
      },
    },
  },
  domain: "help",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const topic = String(args.topic || "").trim();
    const level = String(args.level || "beginner").trim();

    if (!topic) {
      return { success: false, error: "topic 不能为空" };
    }

    // 1. 优先从静态字典查找
    const topicTutorials = TUTORIALS[topic];
    if (topicTutorials) {
      const tutorial = topicTutorials[level] || topicTutorials["beginner"];
      if (tutorial) {
        return {
          success: true,
          data: {
            topic,
            level,
            steps: tutorial.steps.map((s, i) => ({
              step: i + 1,
              title: s.title,
              description: s.description,
              ...(s.tips ? { tips: s.tips } : {}),
            })),
            duration: tutorial.duration,
          },
        };
      }
    }

    // 2. 字典中没有，用 textProvider 生成教程
    try {
      const result = await container.textProvider.generateText(
        `你是 AI 动画工作室的助手。请为主题 "${topic}"（${level} 级别）生成一个简短教程，包含 3-5 个步骤。` +
          `返回 JSON 格式：{"steps":[{"title":"步骤标题","description":"步骤描述","tips":["提示1"]}],"duration":"预计学习时间"}。` +
          `只返回 JSON，不要其他内容。`,
        { maxTokens: 800, temperature: 0.4 },
      );

      if (result.success && result.data?.text) {
        const parsed = safeParseJson<{
          steps?: Array<{ title: string; description: string; tips?: string[] }>;
          duration?: string;
        }>(result.data.text);
        if (parsed && Array.isArray(parsed.steps)) {
          return {
            success: true,
            data: {
              topic,
              level,
              steps: parsed.steps.map((s, i) => ({
                step: i + 1,
                title: s.title,
                description: s.description,
                ...(s.tips ? { tips: s.tips } : {}),
              })),
              duration: parsed.duration || "约 5 分钟",
            },
          };
        }
      }
    } catch {
      // fall through to fallback
    }

    // 3. fallback
    return {
      success: true,
      data: {
        topic,
        level,
        steps: [
          {
            step: 1,
            title: "暂无教程",
            description: `未找到主题 "${topic}"（${level} 级别）的教程。请使用 get_help 工具查看帮助文档目录。`,
          },
        ],
        duration: "—",
      },
    };
  },
};

/** 获取帮助文档 */
export const getHelpTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_help",
      description:
        "获取帮助文档。支持按关键词搜索或按分类筛选。" +
        "如果不提供 query 和 category，返回帮助文档目录。" +
        "分类包括：general（通用）、features（功能）、faq（常见问题）、shortcuts（快捷键）。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词（匹配标题、摘要、内容）。不填则不按关键词搜索。",
          },
          category: {
            type: "string",
            enum: ["general", "features", "faq", "shortcuts"],
            description: "按分类筛选。不填则返回所有分类。",
          },
        },
      },
    },
  },
  domain: "help",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const query = args.query ? String(args.query).toLowerCase().trim() : "";
    const category = args.category ? String(args.category).trim() : "";

    let filtered = HELP_DOCS;

    // 按分类筛选
    if (category) {
      filtered = filtered.filter((d) => d.category === category);
    }

    // 按关键词搜索
    if (query) {
      filtered = filtered.filter(
        (d) =>
          d.title.toLowerCase().includes(query) ||
          d.summary.toLowerCase().includes(query) ||
          d.content.toLowerCase().includes(query),
      );
    }

    // 如果既没有 query 也没有 category，返回目录（只含 title/category/summary，不含完整 content）
    if (!query && !category) {
      return {
        success: true,
        data: {
          articles: filtered.map((d) => ({
            title: d.title,
            category: d.category,
            summary: d.summary,
            content: "",
          })),
          total: filtered.length,
        },
      };
    }

    // 有筛选条件时返回完整内容
    return {
      success: true,
      data: {
        articles: filtered.map((d) => ({
          title: d.title,
          category: d.category,
          summary: d.summary,
          content: d.content,
        })),
        total: filtered.length,
      },
    };
  },
};

/** 列出可用工具/命令 */
export const listAvailableCommandsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_available_commands",
      description:
        "列出当前可用的所有工具/命令。支持按业务域过滤（如 asset/video/story/help 等）。" +
        "数据从工具注册表动态获取，反映当前实际可用的工具。" +
        "可控制是否包含工具描述。",
      parameters: {
        type: "object",
        properties: {
          domain: {
            type: "string",
            description: "按业务域过滤（如 asset、video、story、help、generation、config、system 等）",
          },
          includeDescriptions: {
            type: "boolean",
            description: "是否包含工具描述，默认 true",
            default: true,
          },
        },
      },
    },
  },
  domain: "help",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const domainFilter = args.domain ? String(args.domain).trim() : "";
    const includeDescriptions = args.includeDescriptions !== false;

    try {
      // 从 toolRegistry 动态获取所有工具描述
      const allTools = toolRegistry.getToolDescriptions();

      // 按业务域过滤
      const filtered = domainFilter
        ? allTools.filter((t) => t.domain === domainFilter)
        : allTools;

      // 构建命令列表
      const commands = filtered.map((t) => {
        const cmd: { name: string; domain: string; description?: string } = {
          name: t.name,
          domain: t.domain,
        };
        if (includeDescriptions) {
          cmd.description = t.description;
        }
        return cmd;
      });

      return {
        success: true,
        data: {
          total: commands.length,
          commands,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `获取工具列表失败：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};

/** 建议下一步操作（基于当前项目状态） */
export const suggestNextActionTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "suggest_next_action",
      description:
        "建议下一步操作。基于当前项目状态（角色数、场景数、故事数、视频任务状态）和用户上下文，" +
        "使用 AI 推理生成个性化建议。返回建议列表，每条包含操作、原因、优先级和相关工具名。",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "object",
            description: "用户上下文（可选）",
            properties: {
              current_page: { type: "string", description: "当前所在页面" },
              last_action: { type: "string", description: "上一步操作" },
              user_goal: { type: "string", description: "用户目标" },
            },
          },
        },
      },
    },
  },
  domain: "help",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    // 1. 查询当前项目状态
    let characterCount = 0;
    let sceneCount = 0;
    let storyCount = 0;
    let videoTaskSummary = "无视频任务";
    let failedTaskCount = 0;

    try {
      const { characterService } = await import("@/modules/character");
      const r = await characterService.getAll();
      if (r.ok) characterCount = r.value.length;
    } catch {
      // ignore
    }

    try {
      const { sceneService } = await import("@/modules/scene");
      const r = await sceneService.getAll();
      if (r.ok) sceneCount = r.value.length;
    } catch {
      // ignore
    }

    try {
      const { storyService } = await import("@/modules/story");
      const r = await storyService.getAll();
      if (r.ok) storyCount = r.value.length;
    } catch {
      // ignore
    }

    try {
      const tasks = await container.videoTaskStorage.getVideoTasks();
      const pending = tasks.filter(
        (t) => t.status === "pending" || t.status === "generating",
      ).length;
      const completed = tasks.filter((t) => t.status === "completed").length;
      failedTaskCount = tasks.filter((t) => t.status === "failed").length;
      videoTaskSummary = `共 ${tasks.length} 个任务（进行中 ${pending}，已完成 ${completed}，失败 ${failedTaskCount}）`;
    } catch {
      // ignore
    }

    // 2. 解析用户上下文
    const ctx =
      (args.context as { current_page?: string; last_action?: string; user_goal?: string } | undefined) ?? {};
    const currentPage = ctx.current_page || "未知";
    const lastAction = ctx.last_action || "未知";
    const userGoal = ctx.user_goal || "未指定";

    // 3. 构建提示词，用 textProvider 生成建议
    const prompt =
      `你是 AI 动画工作室的助手。根据当前项目状态，建议用户下一步操作。\n\n` +
      `当前项目状态：\n` +
      `- 角色数量：${characterCount}\n` +
      `- 场景数量：${sceneCount}\n` +
      `- 故事数量：${storyCount}\n` +
      `- 视频任务：${videoTaskSummary}\n\n` +
      `用户上下文：\n` +
      `- 当前页面：${currentPage}\n` +
      `- 上一步操作：${lastAction}\n` +
      `- 用户目标：${userGoal}\n\n` +
      `请返回 JSON 数组，每个元素包含：\n` +
      `- action: 建议的操作（中文，简短）\n` +
      `- reason: 建议原因（中文，1句话）\n` +
      `- priority: 优先级（"high" 或 "medium" 或 "low"）\n` +
      `- toolName: 相关工具名（可选，如 create_character、generate_video 等）\n\n` +
      `返回 2-4 条建议，按优先级从高到低排列。只返回 JSON 数组，不要其他内容。`;

    try {
      const result = await container.textProvider.generateText(prompt, {
        maxTokens: 800,
        temperature: 0.5,
      });

      if (result.success && result.data?.text) {
        const parsed = safeParseJson<
          Array<{
            action?: string;
            reason?: string;
            priority?: string;
            toolName?: string;
          }>
        >(result.data.text);
        if (parsed && Array.isArray(parsed)) {
          const validPriorities = new Set(["high", "medium", "low"]);
          const suggestions = parsed
            .filter((s) => s && typeof s.action === "string")
            .map((s) => ({
              action: String(s.action),
              reason: String(s.reason || ""),
              priority: validPriorities.has(String(s.priority))
                ? (String(s.priority) as "high" | "medium" | "low")
                : "medium",
              ...(s.toolName ? { toolName: String(s.toolName) } : {}),
            }));
          if (suggestions.length > 0) {
            return { success: true, data: { suggestions } };
          }
        }
      }
    } catch {
      // fall through to fallback
    }

    // 4. fallback - 基于项目状态生成简单建议
    const suggestions: Array<{
      action: string;
      reason: string;
      priority: "high" | "medium" | "low";
      toolName?: string;
    }> = [];

    if (characterCount === 0) {
      suggestions.push({
        action: "创建第一个角色",
        reason: "项目中还没有角色，创建角色是开始创作的基础",
        priority: "high",
        toolName: "create_character",
      });
    }
    if (sceneCount === 0) {
      suggestions.push({
        action: "创建第一个场景",
        reason: "项目中还没有场景，创建场景为画面提供环境",
        priority: "high",
        toolName: "create_scene",
      });
    }
    if (storyCount === 0 && characterCount > 0) {
      suggestions.push({
        action: "创建故事",
        reason: "已有角色，可以开始创作故事并拆分分镜",
        priority: "medium",
        toolName: "create_story",
      });
    }
    if (storyCount > 0) {
      suggestions.push({
        action: "生成分镜画面",
        reason: "已有故事，可以为分镜生成关键帧或视频",
        priority: "medium",
        toolName: "generate_video",
      });
    }
    if (failedTaskCount > 0) {
      suggestions.push({
        action: "恢复失败的视频任务",
        reason: `有 ${failedTaskCount} 个失败的视频任务，可以尝试恢复或重试`,
        priority: "high",
        toolName: "recover_video_task",
      });
    }

    // 如果没有特定建议，给出通用建议
    if (suggestions.length === 0) {
      suggestions.push({
        action: "浏览分镜页面",
        reason: "项目已有基础资产，可以在分镜页面开始创作",
        priority: "medium",
      });
    }

    return { success: true, data: { suggestions } };
  },
};

/** 获取快捷键列表 */
export const getKeyboardShortcutsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_keyboard_shortcuts",
      description:
        "获取键盘快捷键列表。支持按上下文过滤（global/editor/shot_page/all）。" +
        "global：全局快捷键；editor：编辑器快捷键；shot_page：分镜页面快捷键；all：全部。",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            enum: ["global", "editor", "shot_page", "all"],
            description: "按上下文过滤，默认 all",
            default: "all",
          },
        },
      },
    },
  },
  domain: "help",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const context = String(args.context || "all").trim();

    let filtered = KEYBOARD_SHORTCUTS;
    if (context && context !== "all") {
      filtered = filtered.filter((s) => s.context === context);
    }

    return {
      success: true,
      data: {
        shortcuts: filtered.map((s) => ({
          key: s.key,
          description: s.description,
          context: s.context,
        })),
      },
    };
  },
};

/** 导出所有帮助工具 */
export const helpTools: ToolImpl[] = [
  explainFeatureTool,
  showTutorialTool,
  getHelpTool,
  listAvailableCommandsTool,
  suggestNextActionTool,
  getKeyboardShortcutsTool,
];
