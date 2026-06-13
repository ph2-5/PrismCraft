/**
 * Test Code Plugin - AI Animation Studio
 *
 * Integration test fixture for code plugin system.
 * Covers: match, capabilities, request building, response extraction,
 * auth headers, model profiles, API key detection, cloud info.
 */
module.exports = {
  id: "test-code-plugin",
  displayName: "Test Code Plugin",

  apiKeyDetection: {
    rules: [
      { pattern: "^tck-[a-zA-Z0-9]{24,}$", confidence: "high" },
    ],
    suggestedName: "Test Code Provider",
    baseUrl: "https://test-code.example.com/v1",
  },

  matchPatterns: [
    { urlPattern: "test-code.example.com" },
    { urlPattern: "test-code-alt.example.com", modelPattern: "tc-" },
  ],

  match: function (apiUrl, model) {
    if (apiUrl.indexOf("test-code.example.com") >= 0) return true;
    if (model && model.indexOf("tc-") === 0) return true;
    return false;
  },

  videoCapabilities: {
    supportsLastFrame: true,
    supportsReferenceVideo: false,
    supportsMimicryLevel: false,
    defaultModel: "tc-video-v1",
    maxDuration: 15,
  },

  imageCapabilities: {
    supportsReferenceImage: true,
    defaultModel: "tc-image-v1",
  },

  getModelCapabilities: function (_modelId) {
    return {
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame: true,
      referenceMode: "separate",
      defaultImageSize: "1024x1024",
      supportedImageSizes: [
        { width: 1024, height: 1024, label: "1:1", aspectRatio: "1:1" },
        { width: 1280, height: 720, label: "16:9", aspectRatio: "16:9" },
      ],
    };
  },

  buildVideoRequest: function (ctx) {
    var body = {
      prompt: ctx.prompt,
      model: ctx.model || "tc-video-v1",
      duration: ctx.duration,
    };
    if (ctx.firstFrameUrl) body.first_frame = ctx.firstFrameUrl;
    if (ctx.lastFrameUrl) body.last_frame = ctx.lastFrameUrl;
    return { body: body, endpoint: "/v1/videos/generations" };
  },

  buildImageRequest: function (ctx) {
    var body = {
      prompt: ctx.prompt,
      model: ctx.model || "tc-image-v1",
      size: ctx.size,
      n: 1,
    };
    if (ctx.referenceImages && ctx.referenceImages.length > 0) {
      body.reference_image = ctx.referenceImages[0];
    }
    return { body: body, endpoint: "/v1/images/generations" };
  },

  buildTextRequest: function (ctx) {
    return {
      body: {
        model: ctx.model || "tc-text-v1",
        messages: [{ role: "user", content: ctx.prompt }],
        max_tokens: ctx.maxTokens || 4096,
        temperature: ctx.temperature || 0.7,
      },
      endpoint: "/v1/chat/completions",
    };
  },

  buildVisionRequest: function (ctx) {
    return {
      body: {
        model: ctx.model || "tc-vision-v1",
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

  extractTaskId: function (data) {
    return data.id || data.task_id;
  },

  extractVideoUrl: function (data) {
    if (data.output && data.output.video_url) return data.output.video_url;
    if (data.data && data.data.video_url) return data.data.video_url;
    return undefined;
  },

  extractImageUrl: function (data) {
    if (data.data && data.data[0]) {
      return data.data[0].url || undefined;
    }
    return undefined;
  },

  extractTextContent: function (response) {
    if (response.choices && response.choices[0] && response.choices[0].message) {
      return response.choices[0].message.content || "";
    }
    return "";
  },

  extractStatus: function (response) {
    var statusMap = {
      "processing": "generating",
      "success": "completed",
      "failed": "failed",
      "timeout": "timeout",
    };
    return {
      status: statusMap[response.status] || response.status || "generating",
      progress: response.progress || response.progress_percentage,
      message: response.error || response.message,
    };
  },

  getAuthHeaders: function (apiKey, _endpoint) {
    return { Authorization: "Bearer " + apiKey };
  },

  getVideoStatusEndpoint: function (baseUrl, taskId, _model) {
    return baseUrl + "/v1/videos/" + taskId;
  },

  getModelParameterProfile: function (modelId) {
    return {
      modelId: modelId,
      displayName: "TC " + modelId,
      capabilities: this.getModelCapabilities(modelId),
      parameters: {
        durations: [
          { value: 5, label: "5s" },
          { value: 10, label: "10s" },
          { value: 15, label: "15s" },
        ],
        resolutions: [
          { value: "1024x1024", label: "1:1", width: 1024, height: 1024 },
          { value: "1280x720", label: "16:9", width: 1280, height: 720 },
        ],
        negativePrompt: true,
        seed: true,
      },
    };
  },

  getAvailableModels: function () {
    return ["tc-video-v1", "tc-video-v2", "tc-image-v1", "tc-text-v1"];
  },

  getCloudInfo: function (_baseUrl) {
    return {
      name: "Test Code Cloud",
      websiteUrl: "https://test-code.example.com",
      taskUrlPattern: function (taskId) {
        return "https://test-code.example.com/tasks/" + taskId;
      },
      apiDocUrl: "https://docs.test-code.example.com",
      howToCheck: "Visit the test code dashboard",
    };
  },

  preferLocalData: true,

  getImageTransportMode: function (purpose) {
    if (purpose === "characterRef" || purpose === "sceneRef") return "base64";
    return "url";
  },
};
