/**
 * 教程字典数据
 *
 * 外层 key 为主题（topic），内层 key 为级别（level）。
 * 从 help-tools-data.ts 按数据类型拆分而来。
 */

/** 教程步骤 */
export interface TutorialStep {
  title: string;
  description: string;
  tips?: string[];
}

/** 教程条目 */
export interface Tutorial {
  steps: TutorialStep[];
  duration: string;
}

/**
 * 教程字典
 * 外层 key 为主题（topic），内层 key 为级别（level）
 */
export const TUTORIALS: Record<string, Record<string, Tutorial>> = {
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
