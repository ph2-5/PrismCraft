import { useNavigate } from "react-router-dom";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { t } from "@/shared/constants/messages";
import { Puzzle, FileJson, Code2, ShieldCheck, ListChecks } from "lucide-react";

const declarativeRequiredFields = [
  { field: "id", descKey: "pluginDoc.decl.id" },
  { field: "version", descKey: "pluginDoc.decl.version" },
  { field: "displayName", descKey: "pluginDoc.decl.displayName" },
  { field: "match.apiUrlPatterns", descKey: "pluginDoc.decl.apiUrlPatterns" },
  { field: "capabilities", descKey: "pluginDoc.decl.capabilities" },
  { field: "transport", descKey: "pluginDoc.decl.transport" },
  { field: "auth", descKey: "pluginDoc.decl.auth" },
  { field: "endpoints", descKey: "pluginDoc.decl.endpoints" },
  { field: "request", descKey: "pluginDoc.decl.request" },
  { field: "response", descKey: "pluginDoc.decl.response" },
];

const codeRequiredFields = [
  { field: "id: string", descKey: "pluginDoc.codeReq.id" },
  { field: "displayName: string", descKey: "pluginDoc.codeReq.displayName" },
  { field: "match(apiUrl, model): boolean", descKey: "pluginDoc.codeReq.match" },
  { field: "videoCapabilities", descKey: "pluginDoc.codeReq.videoCapabilities" },
  { field: "imageCapabilities", descKey: "pluginDoc.codeReq.imageCapabilities" },
  { field: "getModelCapabilities(modelId)", descKey: "pluginDoc.codeReq.getModelCapabilities" },
  { field: "buildVideoRequest(ctx)", descKey: "pluginDoc.codeReq.buildVideoRequest" },
  { field: "buildImageRequest(ctx)", descKey: "pluginDoc.codeReq.buildImageRequest" },
  { field: "extractTaskId(data)", descKey: "pluginDoc.codeReq.extractTaskId" },
  { field: "extractVideoUrl(data)", descKey: "pluginDoc.codeReq.extractVideoUrl" },
  { field: "extractImageUrl(data)", descKey: "pluginDoc.codeReq.extractImageUrl" },
  { field: "getAuthHeaders(apiKey)", descKey: "pluginDoc.codeReq.getAuthHeaders" },
  { field: "getModelParameterProfile(modelId)", descKey: "pluginDoc.codeReq.getModelParameterProfile" },
];

const codeOptionalFields = [
  { field: "matchPatterns", descKey: "pluginDoc.codeOpt.matchPatterns" },
  { field: "apiKeyDetection", descKey: "pluginDoc.codeOpt.apiKeyDetection" },
  { field: "buildTextRequest(ctx)", descKey: "pluginDoc.codeOpt.buildTextRequest" },
  { field: "buildVisionRequest(ctx)", descKey: "pluginDoc.codeOpt.buildVisionRequest" },
  { field: "extractTextContent(response)", descKey: "pluginDoc.codeOpt.extractTextContent" },
  { field: "extractStatus(response)", descKey: "pluginDoc.codeOpt.extractStatus" },
  { field: "getStatusMethod()", descKey: "pluginDoc.codeOpt.getStatusMethod" },
  { field: "getAvailableModels()", descKey: "pluginDoc.codeOpt.getAvailableModels" },
  { field: "getCloudInfo(baseUrl)", descKey: "pluginDoc.codeOpt.getCloudInfo" },
  { field: "preferLocalData", descKey: "pluginDoc.codeOpt.preferLocalData" },
  { field: "getImageTransportMode(purpose)", descKey: "pluginDoc.codeOpt.getImageTransportMode" },
  { field: "appendAuthToUrl(url, apiKey)", descKey: "pluginDoc.codeOpt.appendAuthToUrl" },
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
      className="text-[11px] bg-card2 p-3.5 rounded-lg overflow-auto max-h-[360px] font-mono text-muted-foreground whitespace-pre-wrap m-0 border border-border"
    >
      {code}
    </pre>
  );
}

function FieldRow({ field, descKey }: { field: string; descKey: string }) {
  return (
    <div
      className="flex gap-3 py-2 border-b border-border"
    >
      <code
        className="text-[11px] font-mono text-primary shrink-0 min-w-[220px] bg-[rgba(var(--primary-rgb),0.08)] px-1.5 py-0.5 rounded h-fit"
      >
        {field}
      </code>
      <span className="text-xs text-muted-foreground flex-1">{t(descKey)}</span>
    </div>
  );
}

export default function PluginsPage() {
  const navigate = useNavigate();

  return (
    <PageErrorBoundary pageName={t("pluginDoc.title")}>
      <div className="fade-in flex flex-col h-full">
        {/* top-tabs 标题栏 */}
        <div className="top-tabs justify-between">
          <span className="font-semibold text-sm flex items-center gap-2">
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
          className="flex-1 overflow-y-auto p-4 max-w-[900px] mx-auto w-full flex flex-col gap-4"
        >
          {/* 概述 */}
          <div className="card">
            <div className="section-label">
              <span className="dot ok"></span> {t("pluginDoc.overview")}
            </div>
            <p className="text-[13px] text-muted-foreground mt-2 leading-[1.6]">
              {t("pluginDoc.overviewDesc")}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {t("pluginDoc.subtitle")}
            </p>
          </div>

          {/* 声明式插件 */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <FileJson size={18} className="text-primary" />
              <span className="text-[15px] font-semibold">{t("pluginDoc.declarative")}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-[1.6] mb-3">
              {t("pluginDoc.declarativeDesc")}
            </p>

            <div className="bg-card2 p-2.5 rounded-lg mb-3 text-xs">
              <span className="text-muted-foreground mr-2">{t("pluginDoc.declarativeFile")}:</span>
              <code className="font-mono text-primary">
                {t("pluginDoc.declarativeFileDesc")}
              </code>
            </div>

            {/* 必填字段 */}
            <div className="text-[13px] font-semibold mb-1.5">
              {t("pluginDoc.declarativeRequired")}
            </div>
            <div className="mb-3">
              {declarativeRequiredFields.map((item) => (
                <FieldRow key={item.field} field={item.field} descKey={item.descKey} />
              ))}
            </div>

            <div className="text-xs font-semibold mb-2 mt-1">
              {t("pluginDoc.declarativeExample")}
            </div>
            <CodeBlock code={declarativeExample} />
          </div>

          {/* 代码插件 */}
          <div className="card">
            <div className="flex items-center gap-2 mb-2">
              <Code2 size={18} className="text-warning" />
              <span className="text-[15px] font-semibold">{t("pluginDoc.code")}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-[1.6] mb-3">
              {t("pluginDoc.codeDesc")}
            </p>

            <div className="bg-card2 p-2.5 rounded-lg mb-3 text-xs">
              <span className="text-muted-foreground mr-2">{t("pluginDoc.codeFile")}:</span>
              <code className="font-mono text-warning">
                {t("pluginDoc.codeFileDesc")}
              </code>
            </div>

            {/* 必须字段 */}
            <div className="text-[13px] font-semibold mb-1.5 mt-2">
              {t("pluginDoc.codeRequired")}
            </div>
            <div className="mb-3">
              {codeRequiredFields.map((item) => (
                <FieldRow key={item.field} field={item.field} descKey={item.descKey} />
              ))}
            </div>

            {/* 可选字段 */}
            <div className="text-[13px] font-semibold mb-1.5">
              {t("pluginDoc.codeOptional")}
            </div>
            <div className="mb-3">
              {codeOptionalFields.map((item) => (
                <FieldRow key={item.field} field={item.field} descKey={item.descKey} />
              ))}
            </div>

            <div className="text-xs font-semibold mb-2 mt-1">
              {t("pluginDoc.declarativeExample")}
            </div>
            <CodeBlock code={codeExample} />
          </div>

          {/* 安全限制 */}
          <div
            className="card !bg-[rgba(var(--warning-rgb),0.05)] !border-warning"
          >
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={18} className="text-warning" />
              <span className="text-[15px] font-semibold">{t("pluginDoc.codeSafety")}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-[1.6]">
              {t("pluginDoc.codeSafetyDesc")}
            </p>
          </div>

          {/* 对比表 */}
          <div className="card">
            <div className="section-label mb-3">
              <span className="dot ok"></span> {t("pluginDoc.compare")}
            </div>
            <div
              className="grid gap-px bg-border rounded-lg overflow-hidden [grid-template-columns:120px_1fr_1fr]"
            >
              <div className="bg-card2 px-3 py-2.5 text-xs font-semibold">
                {t("pluginDoc.compareTableType")}
              </div>
              <div className="bg-card2 px-3 py-2.5 text-xs font-semibold">
                {t("pluginDoc.compareTableScene")}
              </div>
              <div className="bg-card2 px-3 py-2.5 text-xs font-semibold">
                {t("pluginDoc.compareTableEffort")}
              </div>

              <div className="bg-card px-3 py-2.5 text-xs text-primary font-medium">
                {t("pluginDoc.compareTableDeclarative")}
              </div>
              <div className="bg-card px-3 py-2.5 text-xs text-muted-foreground">
                {t("pluginDoc.compareTableDeclarativeScene")}
              </div>
              <div className="bg-card px-3 py-2.5 text-xs text-muted-foreground">
                {t("pluginDoc.compareTableDeclarativeEffort")}
              </div>

              <div className="bg-card px-3 py-2.5 text-xs text-warning font-medium">
                {t("pluginDoc.compareTableCode")}
              </div>
              <div className="bg-card px-3 py-2.5 text-xs text-muted-foreground">
                {t("pluginDoc.compareTableCodeScene")}
              </div>
              <div className="bg-card px-3 py-2.5 text-xs text-muted-foreground">
                {t("pluginDoc.compareTableCodeEffort")}
              </div>
            </div>
          </div>

          {/* 开发流程 */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <ListChecks size={18} className="text-success" />
              <span className="text-[15px] font-semibold">{t("pluginDoc.workflow")}</span>
            </div>
            <ol
              className="list-decimal list-inside text-xs flex flex-col gap-1.5 text-muted-foreground m-0 pl-1"
            >
              {workflowSteps.map((step) => (
                <li key={step}>{t(step)}</li>
              ))}
            </ol>
          </div>

          {/* 注意事项 */}
          <div
            className="card !bg-[rgba(var(--destructive-rgb),0.05)] !border-destructive"
          >
            <div className="text-[15px] font-semibold mb-2.5 text-destructive">
              {t("pluginDoc.notes")}
            </div>
            <ul
              className="list-disc list-inside text-xs flex flex-col gap-1.5 text-muted-foreground m-0 pl-1"
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
