import { useNavigate } from "react-router-dom";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { t } from "@/shared/constants/messages";
import { Puzzle, FileJson, Code2, ShieldCheck, ListChecks } from "lucide-react";

const declarativeRequiredFields = [
  { field: "id", desc: "插件唯一 ID（不能与内置 ID 冲突）" },
  { field: "version", desc: "语义化版本号，如 1.0.0" },
  { field: "displayName", desc: "展示名称" },
  { field: "match.apiUrlPatterns", desc: "API URL 匹配模式数组" },
  { field: "capabilities", desc: "video/image/text/vision 能力声明" },
  { field: "transport", desc: "imageMode / videoMode 传输方式" },
  { field: "auth", desc: "bearer / api-key-header / api-key-query / custom" },
  { field: "endpoints", desc: "video/image/text/vision 各端点" },
  { field: "request", desc: "各能力的 bodyFormat 与字段映射" },
  { field: "response", desc: "taskIdPath / videoUrlPath / imageUrlPath 等路径" },
];

const codeRequiredFields = [
  { field: "id: string", desc: "插件唯一 ID" },
  { field: "displayName: string", desc: "展示名称" },
  { field: "match(apiUrl, model): boolean", desc: "URL/模型匹配函数" },
  { field: "videoCapabilities", desc: "视频能力声明对象" },
  { field: "imageCapabilities", desc: "图片能力声明对象" },
  { field: "getModelCapabilities(modelId)", desc: "返回模型能力与参数" },
  { field: "buildVideoRequest(ctx)", desc: "构建视频请求 body/endpoint" },
  { field: "buildImageRequest(ctx)", desc: "构建图片请求 body/endpoint" },
  { field: "extractTaskId(data)", desc: "从响应提取任务 ID" },
  { field: "extractVideoUrl(data)", desc: "从响应提取视频 URL" },
  { field: "extractImageUrl(data)", desc: "从响应提取图片 URL" },
  { field: "getAuthHeaders(apiKey)", desc: "返回鉴权 headers" },
  { field: "getModelParameterProfile(modelId)", desc: "返回模型参数档位" },
];

const codeOptionalFields = [
  { field: "matchPatterns", desc: "URL/模型匹配模式（用于自动检测）" },
  { field: "apiKeyDetection", desc: "API Key 自动识别规则" },
  { field: "buildTextRequest(ctx)", desc: "构建文本请求（启用 text 能力时）" },
  { field: "buildVisionRequest(ctx)", desc: "构建视觉请求（启用 vision 能力时）" },
  { field: "extractTextContent(response)", desc: "从文本响应提取内容" },
  { field: "extractStatus(response)", desc: "提取任务状态/进度" },
  { field: "getStatusMethod()", desc: "返回 GET/POST（默认 GET）" },
  { field: "getAvailableModels()", desc: "返回可用模型列表" },
  { field: "getCloudInfo(baseUrl)", desc: "返回云端任务查询信息" },
  { field: "preferLocalData", desc: "是否优先使用本地数据" },
  { field: "getImageTransportMode(purpose)", desc: "返回图片传输方式" },
  { field: "appendAuthToUrl(url, apiKey)", desc: "URL 鉴权拼接" },
];

const declarativeExample = `{
  "id": "my-provider",
  "version": "1.0.0",
  "displayName": "我的提供商",
  "match": {
    "apiUrlPatterns": ["api.my-provider.com"]
  },
  "capabilities": {
    "video": {
      "supportsLastFrame": true,
      "supportsReferenceVideo": false,
      "supportsMimicryLevel": false,
      "defaultModel": "my-model-v1",
      "maxDuration": 10
    },
    "image": {
      "supportsReferenceImage": false,
      "defaultModel": "my-model-v1"
    }
  },
  "transport": {
    "imageMode": "base64",
    "videoMode": "url",
    "preferLocalData": true
  },
  "auth": { "type": "bearer" },
  "endpoints": {
    "video": {
      "generate": "/v1/videos/generations",
      "status": "/v1/videos/{taskId}"
    },
    "image": { "generate": "/v1/images/generations" }
  },
  "request": {
    "video": { "bodyFormat": "flat" },
    "image": { "bodyFormat": "openai" }
  },
  "response": {
    "video": {
      "taskIdPath": "id",
      "videoUrlPath": "data.video_url"
    },
    "image": { "imageUrlPath": "data.0.url" }
  }
}`;

const codeExample = `module.exports = {
  id: "my-code-provider",
  displayName: "我的代码插件",

  match: (apiUrl, model) => {
    return apiUrl.includes("my-api.example.com");
  },

  videoCapabilities: {
    supportsLastFrame: true,
    supportsReferenceVideo: false,
    supportsMimicryLevel: false,
    defaultModel: "v1",
    maxDuration: 10,
  },
  imageCapabilities: {
    supportsReferenceImage: false,
    defaultModel: "v1",
  },

  getModelCapabilities: (modelId) => ({
    maxReferences: 1,
    maxResolution: 1024,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
  }),

  buildVideoRequest: (ctx) => ({
    endpoint: "/v1/videos",
    body: {
      prompt: ctx.prompt,
      model: ctx.model,
      duration: ctx.duration,
    },
  }),

  buildImageRequest: (ctx) => ({
    endpoint: "/v1/images",
    body: {
      prompt: ctx.prompt,
      model: ctx.model,
      size: ctx.size,
    },
  }),

  extractTaskId: (data) => data.id,
  extractVideoUrl: (data) => data.video_url,
  extractImageUrl: (data) => data.data?.[0]?.url,

  getAuthHeaders: (apiKey) => ({
    Authorization: \`Bearer \${apiKey}\`,
  }),

  getModelParameterProfile: (modelId) => ({
    modelId,
    capabilities: {
      maxReferences: 1,
      maxResolution: 1024,
      maxSizeMB: 10,
      supportsLastFrame: true,
      referenceMode: "separate",
    },
    parameters: {
      durations: [
        { value: 5, label: "5秒" },
        { value: 10, label: "10秒" },
      ],
    },
  }),
};`;

const workflowSteps = [
  "pluginDoc.workflow1",
  "pluginDoc.workflow2",
  "pluginDoc.workflow3",
  "pluginDoc.workflow4",
  "pluginDoc.workflow5",
];

const notes = [
  "pluginDoc.note1",
  "pluginDoc.note2",
  "pluginDoc.note3",
  "pluginDoc.note4",
  "pluginDoc.note5",
  "pluginDoc.note6",
];

function CodeBlock({ code }: { code: string }) {
  return (
    <pre
      style={{
        fontSize: 11,
        background: "#0f172a",
        padding: 14,
        borderRadius: 8,
        overflow: "auto",
        maxHeight: 360,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "var(--muted-fg)",
        whiteSpace: "pre-wrap",
        margin: 0,
        border: "1px solid var(--border)",
      }}
    >
      {code}
    </pre>
  );
}

function FieldRow({ field, desc }: { field: string; desc: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <code
        style={{
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          color: "var(--primary)",
          flexShrink: 0,
          minWidth: 220,
          background: "rgba(var(--primary-rgb, 99, 102, 241), 0.08)",
          padding: "2px 6px",
          borderRadius: 4,
          height: "fit-content",
        }}
      >
        {field}
      </code>
      <span style={{ fontSize: 12, color: "var(--muted-fg)", flex: 1 }}>{desc}</span>
    </div>
  );
}

export default function PluginsPage() {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName={t("pluginDoc.title")}>
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* top-tabs 标题栏 */}
        <div className="top-tabs" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Puzzle size={16} />
            {t("pluginDoc.title")}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => navigate("/settings")}
          >
            {t("pluginDoc.openSettings")}
          </button>
        </div>

        {/* 内容区 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            maxWidth: 900,
            margin: "0 auto",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* 概述 */}
          <div className="card" style={{ padding: 16 }}>
            <div className="section-label">
              <span className="dot ok"></span> {t("pluginDoc.overview")}
            </div>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", marginTop: 8, lineHeight: 1.6 }}>
              {t("pluginDoc.overviewDesc")}
            </p>
            <p style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 8 }}>
              {t("pluginDoc.subtitle")}
            </p>
          </div>

          {/* 声明式插件 */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <FileJson size={18} style={{ color: "var(--primary)" }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t("pluginDoc.declarative")}</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.6, marginBottom: 12 }}>
              {t("pluginDoc.declarativeDesc")}
            </p>

            <div style={{ background: "var(--card2)", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
              <span style={{ color: "var(--muted-fg)", marginRight: 8 }}>{t("pluginDoc.declarativeFile")}:</span>
              <code style={{ fontFamily: "ui-monospace, monospace", color: "var(--primary)" }}>
                {t("pluginDoc.declarativeFileDesc")}
              </code>
            </div>

            {/* 必填字段 */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {t("pluginDoc.declarativeRequired")}
            </div>
            <div style={{ marginBottom: 12 }}>
              {declarativeRequiredFields.map((item) => (
                <FieldRow key={item.field} field={item.field} desc={item.desc} />
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, marginTop: 4 }}>
              {t("pluginDoc.declarativeExample")}
            </div>
            <CodeBlock code={declarativeExample} />
          </div>

          {/* 代码插件 */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Code2 size={18} style={{ color: "var(--warning)" }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t("pluginDoc.code")}</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.6, marginBottom: 12 }}>
              {t("pluginDoc.codeDesc")}
            </p>

            <div style={{ background: "var(--card2)", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
              <span style={{ color: "var(--muted-fg)", marginRight: 8 }}>{t("pluginDoc.codeFile")}:</span>
              <code style={{ fontFamily: "ui-monospace, monospace", color: "var(--warning)" }}>
                {t("pluginDoc.codeFileDesc")}
              </code>
            </div>

            {/* 必须字段 */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, marginTop: 8 }}>
              {t("pluginDoc.codeRequired")}
            </div>
            <div style={{ marginBottom: 12 }}>
              {codeRequiredFields.map((item) => (
                <FieldRow key={item.field} field={item.field} desc={item.desc} />
              ))}
            </div>

            {/* 可选字段 */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {t("pluginDoc.codeOptional")}
            </div>
            <div style={{ marginBottom: 12 }}>
              {codeOptionalFields.map((item) => (
                <FieldRow key={item.field} field={item.field} desc={item.desc} />
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, marginTop: 4 }}>
              {t("pluginDoc.declarativeExample")}
            </div>
            <CodeBlock code={codeExample} />
          </div>

          {/* 安全限制 */}
          <div
            className="card"
            style={{
              padding: 16,
              background: "rgba(var(--warning-rgb, 245, 158, 11), 0.05)",
              borderColor: "var(--warning)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <ShieldCheck size={18} style={{ color: "var(--warning)" }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t("pluginDoc.codeSafety")}</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.6 }}>
              {t("pluginDoc.codeSafetyDesc")}
            </p>
          </div>

          {/* 对比表 */}
          <div className="card" style={{ padding: 16 }}>
            <div className="section-label" style={{ marginBottom: 12 }}>
              <span className="dot ok"></span> {t("pluginDoc.compare")}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr 1fr",
                gap: 1,
                background: "var(--border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div style={{ background: "var(--card2)", padding: "10px 12px", fontSize: 12, fontWeight: 600 }}>
                {t("pluginDoc.compareTableType")}
              </div>
              <div style={{ background: "var(--card2)", padding: "10px 12px", fontSize: 12, fontWeight: 600 }}>
                {t("pluginDoc.compareTableScene")}
              </div>
              <div style={{ background: "var(--card2)", padding: "10px 12px", fontSize: 12, fontWeight: 600 }}>
                {t("pluginDoc.compareTableEffort")}
              </div>

              <div style={{ background: "var(--card)", padding: "10px 12px", fontSize: 12, color: "var(--primary)", fontWeight: 500 }}>
                {t("pluginDoc.compareTableDeclarative")}
              </div>
              <div style={{ background: "var(--card)", padding: "10px 12px", fontSize: 12, color: "var(--muted-fg)" }}>
                {t("pluginDoc.compareTableDeclarativeScene")}
              </div>
              <div style={{ background: "var(--card)", padding: "10px 12px", fontSize: 12, color: "var(--muted-fg)" }}>
                {t("pluginDoc.compareTableDeclarativeEffort")}
              </div>

              <div style={{ background: "var(--card)", padding: "10px 12px", fontSize: 12, color: "var(--warning)", fontWeight: 500 }}>
                {t("pluginDoc.compareTableCode")}
              </div>
              <div style={{ background: "var(--card)", padding: "10px 12px", fontSize: 12, color: "var(--muted-fg)" }}>
                {t("pluginDoc.compareTableCodeScene")}
              </div>
              <div style={{ background: "var(--card)", padding: "10px 12px", fontSize: 12, color: "var(--muted-fg)" }}>
                {t("pluginDoc.compareTableCodeEffort")}
              </div>
            </div>
          </div>

          {/* 开发流程 */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <ListChecks size={18} style={{ color: "var(--success)" }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{t("pluginDoc.workflow")}</span>
            </div>
            <ol
              style={{
                listStyleType: "decimal",
                listStylePosition: "inside",
                fontSize: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                color: "var(--muted-fg)",
                margin: 0,
                paddingLeft: 4,
              }}
            >
              {workflowSteps.map((step) => (
                <li key={step}>{t(step)}</li>
              ))}
            </ol>
          </div>

          {/* 注意事项 */}
          <div
            className="card"
            style={{
              padding: 16,
              background: "rgba(var(--destructive-rgb, 239, 68, 68), 0.05)",
              borderColor: "var(--destructive)",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: "var(--destructive)" }}>
              {t("pluginDoc.notes")}
            </div>
            <ul
              style={{
                listStyleType: "disc",
                listStylePosition: "inside",
                fontSize: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                color: "var(--muted-fg)",
                margin: 0,
                paddingLeft: 4,
              }}
            >
              {notes.map((note) => (
                <li key={note}>{t(note)}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </PageErrorBoundary>
  );
}
