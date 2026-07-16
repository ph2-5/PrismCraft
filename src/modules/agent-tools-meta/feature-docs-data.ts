/**
 * 功能说明字典数据
 *
 * 包含项目各核心功能的详细说明、使用提示、相关功能。
 * 从 help-tools-data.ts 按数据类型拆分而来。
 */

/** 功能说明条目 */
export interface FeatureDoc {
  description: string;
  usageTips: string[];
  relatedFeatures: string[];
}

/**
 * 功能说明字典
 * 包含项目各核心功能的详细说明、使用提示、相关功能
 */
export const FEATURE_DOCS: Record<string, FeatureDoc> = {
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
