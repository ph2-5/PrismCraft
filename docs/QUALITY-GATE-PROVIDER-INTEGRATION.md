# 自研模型接入规范（Quality Gate Provider Integration）

> 状态：**设计草案 v0.2**（重建于 2026-08-06 对象库事故后）
> 目标：兑现"**新模型 1 天接入**"承诺——给收购方看的价值证明

---

## 1. 最小接入面（"1 天承诺"路径拆解）

| 步骤 | 内容 | 形式 | 耗时 |
|---|---|---|---|
| 1. 声明接入 | `matchPatterns` + `apiUrl` + `apiKeyDetection` | 声明式 JSON 插件（`.plugin.json`，零代码） | ~0.5 天 |
| 2. 生成请求适配 | `buildVideoRequest`/`buildImageRequest`（协议差异大时） | code-plugin 或 JSON 请求模板 | ~0.5 天 |
| 3. 质检冒烟 | QualityGate rule checker 零配置生效 + 报告查看 | 已有 UI/CLI | 0.5 天 |

**关键结论**：协议接近 OpenAI/Kling 的自研模型，JSON 插件即可完成接入（第 1 天）；质检层因模型无关（只吃 generated/references/featureAnchors，不碰 provider 协议）**自动生效、零额外接入**。

### 完整接口对比（最小面）
```ts
interface MinimumPluginSurface {
  id: string; displayName: string;
  matchPatterns: Array<{ urlPattern: string; modelPattern?: string }>;
  capabilities: { video?: boolean; image?: boolean; text?: boolean; vision?: boolean };
  buildVideoRequest?: (ctx) => VideoRequestResult;  // code-plugin 才需要
  extractTaskId?: (body) => string;
  extractVideoUrl?: (body) => string;
}
```

## 2. 《自研模型接入指南》目录结构

```
docs/provider-integration/
├── 00-README.md                 # 总览：1 天承诺、接入流程、支持矩阵
├── 01-quickstart-json.md        # 零代码接入：声明式 JSON 模板 + 校验
├── 02-code-plugin.md            # 复杂协议：code-plugin 沙箱说明
├── 03-quality-gate.md           # 质检层自动生效 + 阈值 per-model 配置
├── 04-capability-declaration.md # 能力声明升级
├── 05-validation-checklist.md   # 验收清单
└── examples/
    ├── mock-provider.plugin.json    # 可运行示例（见第 4 节）
    └── mock-consistency-checker.js  # 可运行示例（草案）
```

## 3. 能力声明升级（向后兼容增量）

```ts
capabilities: {
  video?: boolean; image?: boolean; text?: boolean; vision?: boolean;
  /** 新增：声明该模型/插件能承担质检类任务 */
  quality?: Array<"character_consistency" | "scene_consistency" | "continuity" | "artifact">;
  /** 新增：能力强度（供 QualityGate 选最优 checker） */
  qualityLevel?: "rule" | "embedding" | "vlm" | "custom";
}
```
消费方：`registerQualityChecker` 增加可选 `capabilities` 参数；`model-capabilities` 的 `BUILTIN_MODEL_CAPABILITIES` 增加 `supportsQualityGate`（默认 false）。

## 4. 接入示例（草案，不污染 src/）

### 4.1 mock 自研视频模型 provider（声明式 JSON）
```json
{
  "id": "acme-video", "displayName": "Acme 自研视频模型", "version": "0.1.0",
  "matchPatterns": [{ "urlPattern": "https://api.acme.ai/v1", "modelPattern": "acme-v1" }],
  "capabilities": {
    "video": true,
    "quality": ["character_consistency", "scene_consistency"],
    "qualityLevel": "embedding"
  },
  "apiKeyDetection": {
    "rules": [{ "pattern": "sk-acme-", "confidence": "high" }],
    "suggestedName": "Acme API Key"
  },
  "requestTemplate": {
    "video": {
      "method": "POST", "path": "/v1/videos",
      "body": { "model": "{model}", "prompt": "{prompt}", "first_frame": "{firstFrameUrl}" },
      "taskIdField": "task_id", "resultUrlField": "result.video_url"
    }
  }
}
```

### 4.2 mock 自研一致性质检器（code-plugin 形态）
```js
module.exports = {
  id: "acme.consistency", category: "custom",
  capabilities: { quality: ["character_consistency"], qualityLevel: "custom" },
  async run(input) {
    const score = await computeAcmeSimilarity(input.references, input.generated);
    return {
      ok: true, checkerId: "acme.consistency", category: "custom",
      verdict: score >= input.threshold?.fail ? "fail" : score >= input.threshold?.warn ? "warn" : "pass",
      score, evidence: `acme similarity=${score.toFixed(3)}`,
    };
  },
};
```

**验证路径**：插件沙箱回归 + 手动冒烟（配置 acme-video 为默认 provider → 快速生成 → QC 面板显示 acme.consistency 报告）。全程 < 1 天。

## 5. 与插件系统关系（边界）

| 维度 | Provider（生成） | Checker（质检） |
|---|---|---|
| 注册表 | `PluginRegistry`（electron/src/plugins/） | `QualityGateRegistry`（shared-logic/quality-gate/） |
| 最小形态 | 声明式 JSON 插件（零代码） | rule 类内置；外部走 code-plugin |
| 安全隔离 | 声明式=主进程内；代码=vm 沙箱+进程隔离 | 同 code-plugin 沙箱 |
| 能力声明 | `capabilities.quality` 新增字段 | `qualityLevel` 供降级链排序 |

**边界结论**：Provider 解决"生成"，Checker 解决"质检"，两套注册并行、互不耦合；自研模型企业可一次接入两套（各 0.5 天，仍满足 1 天承诺的主体接入）。
