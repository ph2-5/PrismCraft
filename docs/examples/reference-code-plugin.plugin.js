/**
 * 参考代码插件 - AI Animation Studio
 *
 * 这是一个完整的代码插件模板，展示了所有可用的接口方法。
 * 将此文件复制到 ~/AI Animation Studio/CodePlugins/ 目录下即可加载。
 * 文件名必须以 .plugin.js 结尾。
 *
 * 代码插件在沙箱环境中运行，无法访问 Node.js API（require、process、fs 等）。
 * 可用的全局对象：JSON、Math、Date、parseInt、parseFloat、RegExp、String、Number、
 * Boolean、Array、Object、Error、TypeError、RangeError、encodeURIComponent、
 * decodeURIComponent、encodeURI、decodeURI、isNaN、isFinite
 * 以及受限的 console（log/warn/error 输出到应用日志）。
 */
module.exports = {
  // ============================================================
  // 必填字段
  // ============================================================

  /**
   * 插件唯一标识符
   * 只能包含小写字母、数字和连字符，不能与内置插件 ID 冲突
   * 内置 ID: volcengine, kuaishou, zhipu, pixverse, seedance, google,
   *          openai-sora, minimax, openai-compatible, anthropic
   */
  id: "my-code-plugin",

  /**
   * 插件显示名称，在设置界面中展示
   */
  displayName: "我的代码插件",

  // ============================================================
  // API Key 识别（可选）
  // ============================================================

  /**
   * apiKeyDetection - 当用户输入 API Key 时自动识别提供商
   * 如果用户输入的 Key 匹配 rules 中的 pattern，会建议使用此插件
   */
  apiKeyDetection: {
    // 匹配规则列表，按顺序匹配
    rules: [
      {
        // 正则表达式，匹配 Key 的格式
        pattern: "^mk-[a-zA-Z0-9]{32}$",
        // 置信度：high / medium / low
        confidence: "high",
      },
    ],
    // 建议的提供商名称
    suggestedName: "My Provider",
    // 默认的 API 基础 URL
    baseUrl: "https://api.my-provider.com/v1",
  },

  // ============================================================
  // URL 匹配（必填）
  // ============================================================

  /**
   * match - 判断给定的 API URL 和模型是否由此插件处理
   * @param {string} apiUrl - 用户配置的 API URL
   * @param {string} [model] - 可选的模型名称
   * @returns {boolean} - 是否由此插件处理
   */
  match: function (apiUrl, model) {
    // 示例：匹配包含 my-provider.com 的 URL
    return apiUrl.includes("my-provider.com");
  },

  // ============================================================
  // 能力声明（必填）
  // ============================================================

  /**
   * videoCapabilities - 视频生成能力声明
   */
  videoCapabilities: {
    supportsLastFrame: true,        // 是否支持尾帧参考图
    supportsReferenceVideo: false,  // 是否支持参考视频
    supportsMimicryLevel: false,    // 是否支持模仿级别
    defaultModel: "my-model-v1",    // 默认视频模型
    maxDuration: 10,                // 最大视频时长（秒）
  },

  /**
   * imageCapabilities - 图片生成能力声明
   */
  imageCapabilities: {
    supportsReferenceImage: false,  // 是否支持参考图
    defaultModel: "my-model-v1",    // 默认图片模型
  },

  // ============================================================
  // 模型能力（必填）
  // ============================================================

  /**
   * getModelCapabilities - 返回指定模型的详细能力
   * @param {string} modelId - 模型 ID
   * @returns {Object} 模型能力描述
   */
  getModelCapabilities: function (modelId) {
    // 可以根据不同模型返回不同的能力
    var isV2 = modelId && modelId.includes("v2");

    return {
      maxReferences: 4,              // 最大参考图数量
      maxResolution: 2048,           // 最大分辨率
      maxSizeMB: 10,                 // 最大文件大小（MB）
      supportsLastFrame: true,       // 是否支持尾帧
      referenceMode: "separate",     // 参考图模式：separate（分开）或 merged（合并）
      defaultImageSize: "1920x1920", // 默认图片尺寸
      supportedImageSizes: [         // 支持的图片尺寸列表
        { width: 1920, height: 1920, label: "1:1", aspectRatio: "1:1" },
        { width: 1280, height: 720, label: "16:9", aspectRatio: "16:9" },
        { width: 720, height: 1280, label: "9:16", aspectRatio: "9:16" },
      ],
    };
  },

  // ============================================================
  // 请求构建（必填）
  // ============================================================

  /**
   * buildVideoRequest - 构建视频生成请求
   * @param {Object} ctx - 请求上下文
   * @param {string} ctx.prompt - 提示词
   * @param {string} [ctx.model] - 模型名称
   * @param {string} [ctx.firstFrameUrl] - 首帧图片 URL
   * @param {string} [ctx.lastFrameUrl] - 尾帧图片 URL
   * @param {string} [ctx.referenceVideoUrl] - 参考视频 URL
   * @param {string} [ctx.referenceVideoMimicryLevel] - 模仿级别
   * @param {number} ctx.duration - 视频时长（秒）
   * @param {string} [ctx.characterRef] - 角色参考图 URL
   * @param {string} [ctx.sceneRef] - 场景参考图 URL
   * @returns {Object} 请求描述 { body, endpoint, extraHeaders?, method? }
   */
  buildVideoRequest: function (ctx) {
    var body = {
      prompt: ctx.prompt,
      model: ctx.model || "my-model-v1",
      duration: ctx.duration,
    };

    // 可选字段：只在有值时添加
    if (ctx.firstFrameUrl) {
      body.image_url = ctx.firstFrameUrl;
    }
    if (ctx.lastFrameUrl) {
      body.last_frame_url = ctx.lastFrameUrl;
    }
    if (ctx.characterRef) {
      body.character_ref = ctx.characterRef;
    }
    if (ctx.sceneRef) {
      body.scene_ref = ctx.sceneRef;
    }

    return {
      body: body,
      endpoint: "/v1/videos/generations",
      // 可选：额外的请求头
      // extraHeaders: { "X-Custom-Header": "value" },
      // 可选：请求方法，默认 POST
      // method: "POST",
    };
  },

  /**
   * buildImageRequest - 构建图片生成请求
   * @param {Object} ctx - 请求上下文
   * @param {string} ctx.prompt - 提示词
   * @param {string} [ctx.model] - 模型名称
   * @param {string} ctx.size - 图片尺寸（如 "1024x1024"）
   * @param {string[]} ctx.referenceImages - 参考图 URL 列表
   * @param {string} [ctx.characterRef] - 角色参考图 URL
   * @param {string} [ctx.sceneRef] - 场景参考图 URL
   * @returns {Object} 请求描述 { body, endpoint }
   */
  buildImageRequest: function (ctx) {
    var body = {
      prompt: ctx.prompt,
      model: ctx.model || "my-model-v1",
      size: ctx.size,
      n: 1,
    };

    if (ctx.referenceImages && ctx.referenceImages.length > 0) {
      body.reference_image = ctx.referenceImages[0];
    }

    return {
      body: body,
      endpoint: "/v1/images/generations",
    };
  },

  // ============================================================
  // 响应提取（必填）
  // ============================================================

  /**
   * extractTaskId - 从视频生成响应中提取任务 ID
   * @param {Object} data - API 响应数据
   * @returns {string|undefined} 任务 ID
   */
  extractTaskId: function (data) {
    return data.id;
  },

  /**
   * extractVideoUrl - 从视频查询响应中提取视频 URL
   * @param {Object} data - API 响应数据
   * @returns {string|undefined} 视频 URL
   */
  extractVideoUrl: function (data) {
    return data.video_url || (data.data && data.data.video_url);
  },

  /**
   * extractImageUrl - 从图片生成响应中提取图片 URL
   * @param {Object} data - API 响应数据
   * @returns {string|undefined} 图片 URL 或 data:image URI
   */
  extractImageUrl: function (data) {
    if (data.data && data.data[0]) {
      return data.data[0].url || data.data[0].b64_json
        ? "data:image/png;base64," + data.data[0].b64_json
        : undefined;
    }
    return undefined;
  },

  // ============================================================
  // 认证（必填）
  // ============================================================

  /**
   * getAuthHeaders - 返回认证请求头
   * @param {string} apiKey - API Key
   * @param {string} [endpoint] - 请求的端点路径
   * @returns {Object} 请求头键值对
   */
  getAuthHeaders: function (apiKey, endpoint) {
    return { Authorization: "Bearer " + apiKey };
  },

  // ============================================================
  // 模型参数声明（必填）
  // ============================================================

  /**
   * getModelParameterProfile - 返回模型的参数配置
   * 这决定了用户在界面上看到的参数选项
   * @param {string} modelId - 模型 ID
   * @returns {Object} 参数配置
   */
  getModelParameterProfile: function (modelId) {
    return {
      modelId: modelId,
      // 可选：模型显示名称
      displayName: "My Model V1",
      capabilities: this.getModelCapabilities(modelId),
      parameters: {
        // 可选的视频时长列表
        durations: [
          { value: 5, label: "5秒" },
          { value: 10, label: "10秒" },
        ],
        // 可选的分辨率列表
        resolutions: [
          { value: "1920x1920", label: "1:1", width: 1920, height: 1920 },
          { value: "1280x720", label: "16:9", width: 1280, height: 720 },
        ],
        // 可选的风格列表
        styles: [
          { value: "natural", label: "自然", description: "自然风格" },
          { value: "anime", label: "动漫", description: "动漫风格" },
        ],
        // 是否支持反向提示词
        negativePrompt: false,
        // 是否支持随机种子
        seed: false,
        // 可选：CFG Scale 参数
        // cfgScale: { min: 1, max: 20, default: 7, step: 0.5 },
        // 是否支持 LoRA
        // lora: false,
      },
    };
  },

  // ============================================================
  // 可选方法
  // ============================================================

  /**
   * getVideoStatusEndpoint - 构建视频状态查询 URL
   * @param {string} baseUrl - API 基础 URL
   * @param {string} taskId - 任务 ID
   * @param {string} [model] - 模型名称
   * @returns {string} 状态查询 URL
   */
  getVideoStatusEndpoint: function (baseUrl, taskId, model) {
    return baseUrl + "/v1/videos/" + taskId;
  },

  /**
   * buildTextRequest - 构建文本生成请求（可选）
   * 如果不提供，将使用默认的 OpenAI 格式
   */
  buildTextRequest: function (ctx) {
    return {
      body: {
        model: ctx.model || "my-model-v1",
        messages: [{ role: "user", content: ctx.prompt }],
        max_tokens: ctx.maxTokens,
        temperature: ctx.temperature,
      },
      endpoint: "/v1/chat/completions",
    };
  },

  /**
   * buildVisionRequest - 构建视觉理解请求（可选）
   * 如果不提供，将使用默认的 OpenAI 格式
   */
  buildVisionRequest: function (ctx) {
    return {
      body: {
        model: ctx.model || "my-model-v1",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ctx.prompt },
              { type: "image_url", image_url: { url: ctx.imageUrl } },
            ],
          },
        ],
        max_tokens: ctx.maxTokens || 4096,
      },
      endpoint: "/v1/chat/completions",
    };
  },

  /**
   * extractTextContent - 从文本生成响应中提取内容（可选）
   */
  extractTextContent: function (response) {
    if (response.choices && response.choices[0] && response.choices[0].message) {
      return response.choices[0].message.content || "";
    }
    return "";
  },

  /**
   * extractStatus - 从状态查询响应中提取任务状态（可选）
   * @returns {Object} { status, progress?, message? }
   * status 值：completed / generating / failed
   */
  extractStatus: function (response) {
    return {
      status: response.status || "generating",
      progress: response.progress || response.progress_percentage,
      message: response.message || response.error || response.msg,
    };
  },

  /**
   * getStatusMethod - 状态查询使用的 HTTP 方法（可选）
   * @returns {"GET"|"POST"} 默认 GET
   */
  getStatusMethod: function () {
    return "GET";
  },

  /**
   * getAvailableModels - 返回此插件支持的模型列表（可选）
   * @returns {string[]} 模型 ID 列表
   */
  getAvailableModels: function () {
    return ["my-model-v1", "my-model-v2"];
  },

  /**
   * getCloudInfo - 返回云服务商信息（可选）
   * 用于在界面中显示服务商信息和任务查询链接
   */
  getCloudInfo: function (baseUrl) {
    return {
      name: "My Provider",
      websiteUrl: "https://my-provider.com",
      taskUrlPattern: function (taskId) {
        return "https://my-provider.com/dashboard/tasks/" + taskId;
      },
      queryEndpoint: function (baseUrl, taskId) {
        return baseUrl + "/v1/videos/" + taskId;
      },
      apiDocUrl: "https://docs.my-provider.com",
      howToCheck: "在 My Provider 控制台查看任务状态",
    };
  },

  /**
   * preferLocalData - 是否优先使用本地数据（可选）
   * true 时图片会先下载为 base64 再发送
   */
  preferLocalData: true,

  /**
   * getImageTransportMode - 图片传输模式（可选）
   * @param {string} purpose - 图片用途：firstFrame / lastFrame / referenceVideo / characterRef / sceneRef / analysisTarget / referenceImage
   * @returns {"base64"|"url"|"upload"} 默认 "url"
   */
  getImageTransportMode: function (purpose) {
    // 角色参考和场景参考使用 base64 传输
    if (purpose === "characterRef" || purpose === "sceneRef") {
      return "base64";
    }
    return "url";
  },

  /**
   * appendAuthToUrl - 将认证信息附加到 URL（可选）
   * 仅用于 API Key 通过 URL 查询参数传递的场景
   */
  appendAuthToUrl: function (url, apiKey) {
    // 示例：将 API Key 作为查询参数
    // var separator = url.indexOf("?") >= 0 ? "&" : "?";
    // return url + separator + "api_key=" + apiKey;
    return url;
  },
};
