# AI Animation Studio — Agent 系统设计方案

> 版本：v1.0 | 日期：2026-05-27
> 本文档定义 Agent 系统的完整架构、接口协议、业务 Agent 设计及实施路线图。

---

## 一、设计动机

### 1.1 现有 AI 交互模式的局限

当前系统中所有 AI 交互均为**开环调用**：

```
用户触发 → 构建提示词 → 单次 API 调用 → 解析结果 → 规则校验 → 成功/失败
```

| 问题 | 具体表现 |
|------|---------|
| 无观察-推理闭环 | `story-generation-pipeline` 校验失败后机械重试，AI 不理解失败原因 |
| 无自适应策略 | `smart-retry-engine` 用 switch/case 判断，无法理解复合错误 |
| 无修复能力 | `consistency-check-service` 只报告"不一致"，不给修复方案 |
| 无学习能力 | `dynamic-few-shot` 永远是 12 个硬编码示例 |
| 无编排能力 | `useBatchGenerator` 无脑串行，不能从失败中调整策略 |

### 1.2 Agent 化的核心目标

将 AI 交互从"一次性调用"升级为**观察-推理-行动闭环**：

```
感知上下文 → 推理决策 → 调用工具 → 观察结果 → 继续或终止
```

具体目标：
- **理解性迭代**：AI 知道为什么失败，针对性调整而非盲目重试
- **自适应编排**：根据实时结果动态调整生成策略
- **修复而非重报**：检测到问题后给出并执行修复方案
- **经验积累**：从历史生成结果中学习，优化后续决策

---

## 二、架构设计

### 2.1 分层位置

Agent 系统遵循现有 DDD 分层规则：

```
domain/ports/agent-port.ts          → Agent Port 接口（纯类型）
infrastructure/agent/               → Agent Runtime 实现
  ├── runtime.ts                    → Agent 执行引擎
  ├── tool-registry.ts              → 工具注册表
  ├── context-manager.ts            → 上下文管理器
  └── strategies/                   → 通用策略（降级、成本控制）
modules/{module}/agent/             → 各模块的 Agent 实现
  ├── tools/                        → Agent 可调用的工具
  ├── prompts/                      → Agent 的系统提示词
  └── index.ts                      → Barrel 导出
```

依赖方向：

```
modules/{module}/agent/ → domain/ports/agent-port
                        → infrastructure/agent/runtime
                        → infrastructure/di (container)
                        → modules/{module}/services (已有服务)
```

### 2.2 核心 Port 接口

#### 2.2.1 Agent Port

```typescript
// src/domain/ports/agent-port.ts

export interface IAgentRuntime {
  run(input: AgentInput, config: AgentConfig): Promise<AgentOutput>;
}

export interface AgentInput {
  task: string;
  context: Record<string, unknown>;
  tools: AgentToolDefinition[];
}

export interface AgentConfig {
  maxIterations: number;
  maxTokens: number;
  temperature: number;
  requireApproval: string[];       // 需要用户确认的 tool 名称
  fallbackToRules: boolean;        // Agent 失败时是否降级到规则引擎
  timeoutMs: number;
}

export interface AgentOutput {
  success: boolean;
  result: unknown;
  reasoning: AgentReasoning;
  execution: AgentExecution;
}

export interface AgentReasoning {
  analysis: string;                // Agent 对任务的分析
  plan: string;                    // Agent 的执行计划
  observations: string[];          // 每轮观察记录
}

export interface AgentExecution {
  iterations: number;
  toolCalls: AgentToolCall[];
  tokenUsage: TokenUsage;
  durationMs: number;
  fallbackUsed: boolean;           // 是否降级到规则引擎
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AgentToolCall {
  iteration: number;
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  approved: boolean;               // 是否经过用户确认
}
```

#### 2.2.2 Tool 协议

```typescript
// src/domain/ports/agent-port.ts

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, AgentToolParameter>;
  requiresApproval: boolean;       // 该工具是否需要用户确认
}

export interface AgentToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

export interface AgentToolExecutor {
  definition: AgentToolDefinition;
  execute(params: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult>;
}

export interface AgentToolContext {
  signal: AbortSignal;
  userId: string;
  storyId?: string;
  beatId?: string;
}

export interface AgentToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

### 2.3 Agent Runtime 实现

```typescript
// src/infrastructure/agent/runtime.ts

export class AgentRuntime implements IAgentRuntime {
  constructor(
    private textProvider: ITextProvider,
    private toolRegistry: ToolRegistry,
    private contextManager: ContextManager,
  ) {}

  async run(input: AgentInput, config: AgentConfig): Promise<AgentOutput> {
    const startTime = Date.now();
    const execution: AgentExecution = {
      iterations: 0,
      toolCalls: [],
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      durationMs: 0,
      fallbackUsed: false,
    };
    const reasoning: AgentReasoning = {
      analysis: "",
      plan: "",
      observations: [],
    };

    try {
      const systemPrompt = this.buildSystemPrompt(input, config);
      const messages: AgentMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: input.task },
      ];

      for (let i = 0; i < config.maxIterations; i++) {
        execution.iterations = i + 1;

        const llmResponse = await this.callLLM(messages, config);
        execution.tokenUsage.promptTokens += llmResponse.usage.promptTokens;
        execution.tokenUsage.completionTokens += llmResponse.usage.completionTokens;
        execution.tokenUsage.totalTokens += llmResponse.usage.totalTokens;

        const parsed = this.parseResponse(llmResponse.text);

        if (parsed.type === "final_answer") {
          reasoning.observations.push(parsed.reasoning);
          execution.durationMs = Date.now() - startTime;
          return {
            success: true,
            result: parsed.result,
            reasoning,
            execution,
          };
        }

        if (parsed.type === "tool_call") {
          reasoning.observations.push(parsed.reasoning);

          const toolResult = await this.executeTool(
            parsed.toolName,
            parsed.arguments,
            config,
          );

          execution.toolCalls.push({
            iteration: i + 1,
            toolName: parsed.toolName,
            arguments: parsed.arguments,
            result: toolResult.data,
            durationMs: toolResult.durationMs,
            approved: !config.requireApproval.includes(parsed.toolName),
          });

          messages.push({ role: "assistant", content: llmResponse.text });
          messages.push({
            role: "tool",
            content: JSON.stringify(toolResult),
          });
        }
      }

      execution.durationMs = Date.now() - startTime;
      return {
        success: false,
        result: null,
        reasoning,
        execution,
      };
    } catch (error) {
      if (config.fallbackToRules) {
        execution.fallbackUsed = true;
        execution.durationMs = Date.now() - startTime;
        return {
          success: false,
          result: null,
          reasoning,
          execution,
        };
      }
      throw error;
    }
  }
}
```

### 2.4 工具注册表

```typescript
// src/infrastructure/agent/tool-registry.ts

export class ToolRegistry {
  private tools: Map<string, AgentToolExecutor> = new Map();

  register(executor: AgentToolExecutor): void {
    this.tools.set(executor.definition.name, executor);
  }

  getDefinitions(): AgentToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  getDefinitionsByName(names: string[]): AgentToolDefinition[] {
    return names
      .map((name) => this.tools.get(name)?.definition)
      .filter(Boolean) as AgentToolDefinition[];
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: AgentToolContext,
  ): Promise<AgentToolResult> {
    const executor = this.tools.get(toolName);
    if (!executor) {
      return { success: false, data: null, error: `Unknown tool: ${toolName}` };
    }
    return executor.execute(params, context);
  }
}
```

### 2.5 上下文管理器

```typescript
// src/infrastructure/agent/context-manager.ts

export class ContextManager {
  private history: Map<string, AgentExecution[]> = new Map();

  recordExecution(agentId: string, execution: AgentExecution): void {
    const existing = this.history.get(agentId) || [];
    existing.push(execution);
    if (existing.length > 50) existing.shift();
    this.history.set(agentId, existing);
  }

  getRecentExecutions(agentId: string, count: number = 5): AgentExecution[] {
    const all = this.history.get(agentId) || [];
    return all.slice(-count);
  }

  getFailurePatterns(agentId: string): FailurePattern[] {
    const executions = this.getRecentExecutions(agentId, 20);
    // 分析失败模式：哪些工具调用失败率高、哪些提供商经常超时等
    return analyzeFailurePatterns(executions);
  }

  getSuccessPatterns(agentId: string): SuccessPattern[] {
    const executions = this.getRecentExecutions(agentId, 20);
    // 分析成功模式：哪些提示词风格成功率高、哪些参数组合效果好
    return analyzeSuccessPatterns(executions);
  }
}
```

---

## 三、业务 Agent 设计

### 3.1 故事规划 Agent（Story Planning Agent）

#### 3.1.1 替代目标

替代 `src/modules/shot/shot-generation/story-generation-pipeline.ts` 中的 `generateStoryPlanWithValidation`。

#### 3.1.2 工具定义

| 工具名 | 描述 | 参数 | 需确认 |
|--------|------|------|--------|
| `generate_beats` | 调用 LLM 生成分镜 | `prompt: string, maxBeats: number` | 否 |
| `validate_beats` | 校验分镜参数合法性 | `beats: Beat[]` | 否 |
| `fix_beat` | 修正是单个分镜的参数 | `beatIndex: number, fixes: Record<string, unknown>` | 否 |
| `query_elements` | 查询元素库中的元素 | `elementIds: string[]` | 否 |
| `query_characters` | 查询角色详情 | `characterIds: string[]` | 否 |
| `query_scenes` | 查询场景详情 | `sceneIds: string[]` | 否 |
| `save_draft` | 保存当前草稿到数据库 | `beats: Beat[]` | 否 |
| `request_user_input` | 向用户提问 | `question: string, options: string[]` | 是 |

#### 3.1.3 系统提示词

```
你是一个专业的动画分镜规划师。你的任务是根据故事梗概、角色、场景和元素，
规划出完整的分镜序列。

## 工作流程

1. **分析**：阅读故事梗概，理解叙事目标、角色关系和场景设定
2. **规划**：确定叙事结构（三幕式/五幕式），规划节奏曲线
3. **生成**：逐个生成分镜，每个分镜都知道前面所有分镜的内容
4. **审查**：检查叙事连贯性、角色/场景引用完整性、镜头多样性
5. **修正**：发现问题后针对性修正，而非全部重新生成

## 约束

- 每个分镜的 content 必须具体、有画面感
- 镜头参数必须与内容匹配
- 角色引用必须使用已有的角色 ID
- 场景引用必须使用已有的场景 ID
- 元素引用必须使用全局元素编号
- 首帧/尾帧提示词必须用英文
- 时长范围：2-30 秒

## 输出格式

完成规划后，调用 save_draft 工具保存结果。
如果遇到不确定的决策点，调用 request_user_input 工具询问用户。
```

#### 3.1.4 决策策略

| 场景 | 当前行为 | Agent 行为 |
|------|---------|-----------|
| 校验失败 | 把错误列表贴回 prompt 重试 | 分析具体哪个字段不合规，针对性修正 |
| 角色未引用 | 自动填充默认角色 | 查询角色库，选择最匹配的角色 |
| 连续相同景别 | 无检测 | 自动调整景别多样性 |
| Few-shot 选择 | 静态 12 个 | 从历史成功案例中动态选取 |

#### 3.1.5 降级策略

当 Agent 失败（超时/Token 超限/LLM 不可用）时，降级到现有的 `generateStoryPlanWithValidation`，保证功能不中断。

---

### 3.2 生成编排 Agent（Generation Orchestration Agent）

#### 3.2.1 替代目标

替代 `src/modules/story/generation/hooks/useBatchGenerator.ts` 的批量生成逻辑。

#### 3.2.2 工具定义

| 工具名 | 描述 | 参数 | 需确认 |
|--------|------|------|--------|
| `generate_keyframe` | 生成分镜预览图 | `beatId: string, params: KeyframeParams` | 否 |
| `generate_frame_pair` | 生成首尾帧 | `beatId: string, params: FramePairParams` | 否 |
| `generate_video` | 提交视频生成任务 | `beatId: string, params: VideoParams` | 否 |
| `check_consistency` | 检查视觉一致性 | `beatId: string` | 否 |
| `switch_provider` | 切换 AI 提供商 | `providerId: string, modelId: string` | 是 |
| `modify_prompt` | 修改分镜提示词 | `beatId: string, adjustments: PromptAdjustments` | 否 |
| `get_beat_status` | 查询分镜当前状态 | `beatId: string` | 否 |
| `get_dependency_graph` | 获取分镜依赖关系图 | `storyId: string` | 否 |
| `get_provider_health` | 查询提供商健康状态 | 无 | 否 |
| `skip_beat` | 跳过某个分镜 | `beatId: string, reason: string` | 是 |

#### 3.2.2 系统提示词

```
你是一个动画生成编排器。你的任务是编排多个分镜的生成流程，
确保高效、一致地完成所有分镜的生成。

## 工作流程

1. **分析依赖**：获取分镜依赖图，确定可并行和必须串行的分镜
2. **选择策略**：根据提供商健康状态和分镜特征选择生成策略
3. **执行生成**：按依赖顺序调用生成工具
4. **观察结果**：检查生成是否成功、一致性是否达标
5. **自适应调整**：根据结果调整后续分镜的提示词或提供商

## 决策规则

- 如果某个提供商连续失败 3 次，自动切换到备用提供商
- 如果一致性检查分数 < 0.6，修改提示词后重新生成
- 如果提示词被截断（promptWasTruncated），精简提示词后重试
- 关键转折点分镜优先生成，确保质量
- 并行分镜使用不同提供商，提高吞吐量

## 成本控制

- 每个分镜最多重试 3 次
- 总 Token 消耗不超过预算上限
- 超过预算时，优先保证关键分镜的质量
```

#### 3.2.3 依赖图数据结构

```typescript
interface GenerationDependencyGraph {
  nodes: GenerationNode[];
  edges: GenerationEdge[];
  parallelGroups: string[][];      // 可并行生成的分镜组
  criticalPath: string[];          // 关键路径上的分镜
}

interface GenerationNode {
  beatId: string;
  level: "keyframe" | "framepair" | "video";
  status: "pending" | "generating" | "completed" | "failed";
  dependencies: string[];          // 依赖的 beatId 列表
  priority: "critical" | "normal" | "low";
  preferredProvider?: string;      // 历史成功率最高的提供商
}

interface GenerationEdge {
  from: string;
  to: string;
  type: "chain_reference" | "consistency_constraint";
}
```

---

### 3.3 提示词优化 Agent（Prompt Optimization Agent）

#### 3.3.1 替代目标

增强 `src/modules/prompt/video/services/video-prompt-service.ts`，在模板拼接后增加 AI 优化环节。

#### 3.3.2 工具定义

| 工具名 | 描述 | 参数 | 需确认 |
|--------|------|------|--------|
| `get_prompt_template` | 获取基础提示词模板 | `beatId: string, mode: "professional"\|"enhanced"\|"quick"` | 否 |
| `get_provider_style` | 获取提供商特定的提示词风格指南 | `providerId: string` | 否 |
| `get_history` | 获取历史生成记录 | `filters: HistoryFilters` | 否 |
| `get_consistency_feedback` | 获取最近的一致性检查反馈 | `storyId: string` | 否 |
| `optimize_prompt` | 调用 LLM 优化提示词 | `prompt: string, context: OptimizationContext` | 否 |
| `validate_prompt_length` | 校验提示词长度限制 | `prompt: string, providerId: string` | 否 |

#### 3.3.3 知识库设计

```typescript
interface PromptKnowledgeBase {
  providerStyles: Record<string, ProviderStyleGuide>;
  successHistory: PromptSuccessRecord[];
  userEdits: PromptEditRecord[];
}

interface ProviderStyleGuide {
  providerId: string;
  preferredLanguage: "en" | "zh" | "mixed";
  maxPromptLength: number;
  styleNotes: string;             // 如 "Kling 偏好简洁描述，Sora 偏好电影化语言"
  effectiveKeywords: string[];    // 该提供商下高成功率的关键词
  avoidKeywords: string[];        // 该提供商下低成功率的关键词
}

interface PromptSuccessRecord {
  prompt: string;
  providerId: string;
  modelId: string;
  success: boolean;
  consistencyScore?: number;
  timestamp: number;
}

interface PromptEditRecord {
  originalPrompt: string;
  editedPrompt: string;
  diff: string;                   // 用户修改了什么
  subsequentSuccess: boolean;     // 修改后是否成功
}
```

#### 3.3.4 优化流程

```
1. 模板拼接 → 基础提示词（现有 video-prompt-service 逻辑）
2. 查询知识库 → 该提供商的风格指南 + 历史成功案例
3. 查询一致性反馈 → 最近失败的模式
4. LLM 优化 → 根据以上信息调整提示词
5. 长度校验 → 确保不超过提供商限制
6. 返回优化后的提示词
```

---

### 3.4 一致性守护 Agent（Consistency Guardian Agent）

#### 3.4.1 替代目标

增强 `src/modules/shot/consistency-check/services/consistency-check-service.ts`，从"只检查"升级为"检查+诊断+修复"。

#### 3.4.2 工具定义

| 工具名 | 描述 | 参数 | 需确认 |
|--------|------|------|--------|
| `check_visual_consistency` | 检查视觉一致性 | `beatId: string, imageUrl: string` | 否 |
| `check_cross_beat_consistency` | 跨分镜一致性对比 | `beatIds: string[]` | 否 |
| `diagnose_issue` | 诊断一致性违规原因 | `checkResult: ConsistencyCheckResult` | 否 |
| `prescribe_fix` | 开出修复处方 | `diagnosis: ConsistencyDiagnosis` | 否 |
| `apply_fix` | 执行修复 | `fix: ConsistencyFix` | 是 |
| `regenerate_with_fix` | 应用修复后重新生成 | `beatId: string, fix: ConsistencyFix` | 是 |

#### 3.4.3 诊断-修复协议

```typescript
interface ConsistencyDiagnosis {
  issueType: "missing_description" | "weak_reference" | "provider_limitation" | "prompt_ambiguity";
  severity: "low" | "medium" | "high";
  affectedElements: string[];
  rootCause: string;
  confidence: number;
}

interface ConsistencyFix {
  type: "prompt_enhancement" | "parameter_adjustment" | "provider_switch" | "reference_update";
  description: string;
  changes: Record<string, unknown>;
  estimatedImprovement: number;   // 预计一致性分数提升
  tokenCost: number;              // 预计额外 Token 消耗
}
```

#### 3.4.4 诊断决策树

```
一致性检查失败
├── 角色外观不一致
│   ├── 提示词缺少外观描述 → prompt_enhancement
│   ├── 参考图权重不够 → parameter_adjustment (提高 feature_anchoring 权重)
│   └── 提供商能力限制 → provider_switch (切换到一致性更好的提供商)
├── 场景氛围不一致
│   ├── 场景描述过于笼统 → prompt_enhancement
│   └── 缺少场景参考图 → reference_update
└── 元素特征偏移
    ├── 特征锚定未启用 → parameter_adjustment (启用 feature_anchoring)
    └── 锚定特征标签不准确 → reference_update (更新特征标签)
```

---

### 3.5 智能恢复 Agent（Recovery Agent）

#### 3.5.1 替代目标

替代 `src/modules/video/recovery/services/smart-retry-engine.ts` 的规则引擎。

#### 3.5.2 工具定义

| 工具名 | 描述 | 参数 | 需确认 |
|--------|------|------|--------|
| `analyze_failure` | 分析失败原因 | `taskId: string, errorContext: ErrorContext` | 否 |
| `check_quota` | 检查用户配额 | `providerId: string` | 否 |
| `check_provider_status` | 检查提供商服务状态 | `providerId: string` | 否 |
| `retry_with_modifications` | 修改参数后重试 | `taskId: string, modifications: Record<string, unknown>` | 否 |
| `switch_provider_and_retry` | 切换提供商后重试 | `taskId: string, newProviderId: string` | 是 |
| `abandon_task` | 放弃任务 | `taskId: string, reason: string` | 是 |
| `notify_user` | 通知用户 | `message: string, level: "info"\|"warning"\|"error"` | 否 |

#### 3.5.3 推理上下文

```typescript
interface RecoveryContext {
  task: VideoTask;
  errorHistory: ErrorRecord[];
  providerHealth: Record<string, ProviderHealthStatus>;
  userQuota: QuotaInfo;
  recentSuccessRate: Record<string, number>;  // 每个提供商的近期成功率
  similarRecoveries: RecoveryRecord[];        // 类似失败的历史恢复记录
}
```

#### 3.5.4 决策策略

| 场景 | 规则引擎行为 | Agent 行为 |
|------|------------|-----------|
| 超时 + 部分结果 | 只看超时分类 | 分析部分结果是否有用，决定重试还是接受 |
| 未知错误码 | 标记为 unknown，低置信度重试 | 分析错误消息语义，推断可能原因 |
| 连续失败 5 次 | 放弃 | 检查是否所有提供商都失败，尝试完全不同的参数组合 |
| 配额不足 | 直接放弃 | 检查其他提供商配额，自动切换 |
| 速率限制 | 等待后重试 | 计算最优等待时间，考虑其他任务的调度 |

---

## 四、DI 容器集成

### 4.1 新增 Token

```typescript
// src/infrastructure/di/container.ts 新增

// ── F. Agent Runtime（有状态，模块通过 Port 接口解耦） ──────────────
agentRuntime: createToken<IAgentRuntime>("agentRuntime", () => agentRuntime),
toolRegistry: createToken<ToolRegistry>("toolRegistry", () => toolRegistry),
contextManager: createToken<ContextManager>("contextManager", () => contextManager),
```

### 4.2 Token 分类

Agent 相关 Token 属于 **Category F: Agent Runtime**：

| Token | 类型 | 说明 |
|-------|------|------|
| `agentRuntime` | 有状态服务 | Agent 执行引擎，需测试替换 |
| `toolRegistry` | 有状态服务 | 工具注册表，需测试替换 |
| `contextManager` | 有状态服务 | 上下文管理器，需测试替换 |

### 4.3 业务 Agent 不注册为 DI Token

业务 Agent（Story Planning Agent、Generation Orchestration Agent 等）**不注册为 DI Token**。它们通过构造函数接收 `IAgentRuntime` 和所需的 `AgentToolExecutor[]`，在模块内部实例化：

```typescript
// src/modules/story/planning/agent/story-planning-agent.ts

export class StoryPlanningAgent {
  constructor(
    private runtime: IAgentRuntime,
    private tools: AgentToolExecutor[],
  ) {}

  async plan(input: StoryPlanningInput): Promise<Result<StoryPlanningResult>> {
    const agentInput = this.buildInput(input);
    const config = this.buildConfig(input.options);
    const output = await this.runtime.run(agentInput, config);

    if (!output.success && config.fallbackToRules) {
      return this.fallbackToPipeline(input);
    }

    return this.convertOutput(output);
  }
}
```

理由：业务 Agent 是模块内部实现细节，不需要跨模块访问，不需要测试替换（测试替换 `IAgentRuntime` 即可）。

---

## 五、模块集成方案

### 5.1 目录结构

```
src/modules/story/
  planning/
    agent/                          ← 新增
      story-planning-agent.ts
      tools/
        generate-beats.ts
        validate-beats.ts
        fix-beat.ts
        query-elements.ts
        save-draft.ts
        request-user-input.ts
      prompts/
        system-prompt.ts
      index.ts
    services/
      story-planning-service.ts     ← 修改：增加 Agent 调用路径
    hooks/
      useStoryPlanner.ts            ← 修改：增加 agentMode 参数
    contract.json                   ← 修改：新增 agent 子域

src/modules/story/
  generation/
    agent/                          ← 新增
      generation-orchestration-agent.ts
      tools/
        generate-keyframe.ts
        generate-frame-pair.ts
        generate-video.ts
        check-consistency.ts
        switch-provider.ts
        modify-prompt.ts
        get-beat-status.ts
        get-dependency-graph.ts
        skip-beat.ts
      prompts/
        system-prompt.ts
      index.ts

src/modules/prompt/
  agent/                            ← 新增
    prompt-optimization-agent.ts
    tools/
      get-prompt-template.ts
      get-provider-style.ts
      get-history.ts
      optimize-prompt.ts
    prompts/
      system-prompt.ts

src/modules/shot/
  consistency-check/
    agent/                          ← 新增
      consistency-guardian-agent.ts
      tools/
        check-visual-consistency.ts
        diagnose-issue.ts
        prescribe-fix.ts
        apply-fix.ts
      prompts/
        system-prompt.ts

src/modules/video/
  recovery/
    agent/                          ← 新增
      recovery-agent.ts
      tools/
        analyze-failure.ts
        check-quota.ts
        retry-with-modifications.ts
        switch-provider-and-retry.ts
        abandon-task.ts
      prompts/
        system-prompt.ts
```

### 5.2 调用路径

**现有路径（保留为降级路径）**：

```
useStoryPlanner → storyPlanningService.planStory()
  → generateStoryPlanWithValidation()  // 规则引擎
```

**Agent 路径（新增）**：

```
useStoryPlanner → storyPlanningService.planStory({ agentMode: true })
  → storyPlanningAgent.plan()
    → agentRuntime.run()
      → LLM 推理 → tool 调用 → 观察 → 继续/终止
  ↓ 失败降级
  → generateStoryPlanWithValidation()  // 规则引擎兜底
```

### 5.3 UI 层变更

各页面组件增加 Agent 模式开关：

```typescript
// 用户可选：快速模式（规则引擎） / 智能模式（Agent）
type GenerationMode = "quick" | "smart";

// 智能模式下的 Agent 状态展示
interface AgentStatus {
  phase: "thinking" | "executing" | "reviewing" | "fixing";
  currentAction: string;
  reasoning: string;               // Agent 的思考过程，可展示给用户
  progress: number;
  toolCalls: AgentToolCall[];      // 已执行的工具调用
}
```

---

## 六、成本控制与安全

### 6.1 Token 预算

| Agent | 单次调用 Token 上限 | 每日 Token 上限 | 说明 |
|-------|-------------------|----------------|------|
| Story Planning | 8,000 | 80,000 | 一次性规划，不需要频繁调用 |
| Generation Orchestration | 4,000/轮 | 40,000 | 每轮决策消耗较少 |
| Prompt Optimization | 2,000 | 20,000 | 优化是轻量操作 |
| Consistency Guardian | 3,000 | 30,000 | 检查+诊断+修复 |
| Recovery | 2,000 | 20,000 | 紧急决策，快速响应 |

### 6.2 迭代次数限制

| Agent | 最大迭代次数 | 说明 |
|-------|------------|------|
| Story Planning | 10 | 规划+审查+修正 |
| Generation Orchestration | 5/分镜 | 生成+检查+重试 |
| Prompt Optimization | 3 | 优化+校验+微调 |
| Consistency Guardian | 5 | 检查+诊断+修复 |
| Recovery | 3 | 分析+决策+执行 |

### 6.3 用户确认机制

以下操作必须经过用户确认才能执行：

| 操作 | 所属 Agent | 确认方式 |
|------|-----------|---------|
| 切换 AI 提供商 | Generation Orchestration | Toast 确认 |
| 放弃任务 | Recovery | 对话框确认 |
| 跳过分镜 | Generation Orchestration | Toast 确认 |
| 应用一致性修复 | Consistency Guardian | 修复预览确认 |
| 向用户提问 | Story Planning | 对话框 |

### 6.4 降级策略

```typescript
interface FallbackConfig {
  enabled: boolean;
  maxRetries: number;              // Agent 失败后重试次数
  retryDelayMs: number;
  fallbackToRules: boolean;        // 最终降级到规则引擎
  notifyUserOnFallback: boolean;   // 降级时是否通知用户
}
```

降级触发条件：
1. Agent 超时（超过 `config.timeoutMs`）
2. Token 消耗超过预算
3. LLM 返回无法解析的响应（连续 2 次）
4. 所有工具调用失败
5. 用户主动取消

### 6.5 安全约束

- Agent 工具不能执行 DDL 操作（遵循现有 IPC 安全规则）
- Agent 不能访问其他用户的 API Key
- Agent 的所有工具调用都经过 `AgentToolContext.signal` 支持取消
- Agent 的推理过程记录到日志，可审计
- Agent 不能绕过 SSRF 防护

---

## 七、LLM 调用协议

### 7.1 请求格式

Agent 与 LLM 的交互采用 ReAct (Reasoning + Acting) 模式：

```
System: [系统提示词 + 工具定义]

User: [任务描述 + 上下文]

Assistant: 
  Thought: [推理过程]
  Action: [工具名称]
  Action Input: [工具参数 JSON]

Tool: [工具执行结果 JSON]

Assistant:
  Thought: [观察结果 + 下一步推理]
  Action: [工具名称 或 Final Answer]
  Action Input: [工具参数 或 最终结果 JSON]
```

### 7.2 响应解析

```typescript
interface ParsedAgentResponse {
  type: "tool_call" | "final_answer" | "clarification_needed";
  reasoning: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  question?: string;               // 需要用户澄清的问题
}
```

### 7.3 提供商适配

Agent Runtime 使用 `ITextProvider.generateText` 作为底层 LLM 调用，通过 DI 容器获取。不同提供商的格式差异在 `infrastructure/ai-providers` 层处理，Agent 层无需关心。

---

## 八、测试策略

### 8.1 单元测试

| 测试目标 | 测试内容 | Mock 策略 |
|---------|---------|----------|
| AgentRuntime | 迭代循环、Token 统计、降级逻辑 | Mock ITextProvider |
| ToolRegistry | 注册、查找、执行 | 无需 Mock |
| ContextManager | 历史记录、模式分析 | 无需 Mock |
| 各 Agent | 决策逻辑、降级路径 | Mock IAgentRuntime |
| 各 Tool | 参数校验、执行逻辑 | Mock container 依赖 |

### 8.2 集成测试

| 测试场景 | 验证内容 |
|---------|---------|
| Story Planning Agent → 数据库 | 生成的分镜正确持久化 |
| Generation Orchestration Agent → AI Provider | 工具调用正确转发到 Provider |
| Recovery Agent → SmartRetryEngine 降级 | Agent 失败后正确降级 |
| 端到端：规划 → 生成 → 检查 → 修复 | 完整 Agent 协作链路 |

### 8.3 测试文件位置

```
src/infrastructure/agent/__tests__/
  runtime.test.ts
  tool-registry.test.ts
  context-manager.test.ts

src/modules/story/planning/agent/__tests__/
  story-planning-agent.test.ts
  tools/generate-beats.test.ts

src/modules/story/generation/agent/__tests__/
  generation-orchestration-agent.test.ts

src/modules/prompt/agent/__tests__/
  prompt-optimization-agent.test.ts

src/modules/shot/consistency-check/agent/__tests__/
  consistency-guardian-agent.test.ts

src/modules/video/recovery/agent/__tests__/
  recovery-agent.test.ts
```

---

## 九、实施路线图

### Phase 1：基础设施（2 周）

```
Week 1:
  ├── 定义 Agent Port 接口（domain/ports/agent-port.ts）
  ├── 实现 AgentRuntime（infrastructure/agent/runtime.ts）
  ├── 实现 ToolRegistry（infrastructure/agent/tool-registry.ts）
  └── 实现 ContextManager（infrastructure/agent/context-manager.ts）

Week 2:
  ├── 注册 DI Token（container.ts Category F）
  ├── 编写基础设施单元测试
  ├── 编写集成测试骨架
  └── 验证降级路径
```

### Phase 2：故事规划 Agent（3 周）

```
Week 3:
  ├── 实现 6 个工具
  ├── 编写系统提示词
  └── 实现 StoryPlanningAgent

Week 4:
  ├── 集成到 storyPlanningService
  ├── 修改 useStoryPlanner 增加 agentMode
  └── UI：Agent 状态展示组件

Week 5:
  ├── 端到端测试
  ├── 降级路径测试
  └── 性能基准测试（Agent vs 规则引擎）
```

### Phase 3：生成编排 Agent（3 周）

```
Week 6:
  ├── 实现依赖图数据结构
  ├── 实现 10 个工具
  └── 编写系统提示词

Week 7:
  ├── 实现 GenerationOrchestrationAgent
  ├── 集成到 useBatchGenerator
  └── UI：编排状态面板

Week 8:
  ├── 并行生成测试
  ├── 提供商自动切换测试
  └── 成本控制验证
```

### Phase 4：提示词优化 + 一致性守护 + 智能恢复（4 周）

```
Week 9-10:
  ├── 实现 Prompt Optimization Agent
  ├── 实现知识库（ProviderStyleGuide + 历史记录）
  └── 集成到 video-prompt-service

Week 11-12:
  ├── 实现 Consistency Guardian Agent
  ├── 实现 Recovery Agent
  ├── 替换 smart-retry-engine 调用路径
  └── 全链路集成测试
```

### Phase 5：打磨与优化（2 周）

```
Week 13:
  ├── 提示词调优（各 Agent 的 system prompt）
  ├── 成本优化（减少不必要的 LLM 调用）
  └── UI 交互优化

Week 14:
  ├── 全面回归测试
  ├── 性能基准测试
  ├── 文档更新（MODULE.md + contract.json）
  └── 架构扫描验证
```

**总工期：14 周（约 3.5 个月）**

---

## 十、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| LLM 调用成本过高 | 高 | 高 | 严格 Token 预算 + 降级到规则引擎 |
| Agent 推理不稳定 | 中 | 高 | 降级机制 + 人工确认关键决策 |
| 工具执行副作用 | 低 | 高 | 需确认工具列表 + 可回滚操作 |
| Agent 响应延迟 | 中 | 中 | 超时机制 + 异步执行 + 进度展示 |
| 提示词注入攻击 | 低 | 高 | 输入净化 + 工具参数校验 |
| 与现有代码冲突 | 中 | 中 | Agent 作为可选路径，不修改现有逻辑 |

---

## 十一、成功指标

| 指标 | 基线（规则引擎） | 目标（Agent） |
|------|----------------|-------------|
| 故事规划一次通过率 | ~40% | >70% |
| 批量生成成功率 | ~60% | >80% |
| 一致性检查修复率 | 0%（只报告） | >50% |
| 失败任务恢复率 | ~30% | >60% |
| 用户手动干预次数 | 高 | 降低 50% |
| 单次规划 Token 消耗 | ~2,000 | <8,000（含重试） |

---

## 附录 A：Agent Port 完整类型定义

```typescript
// src/domain/ports/agent-port.ts

export type {
  IAgentRuntime,
  AgentInput,
  AgentConfig,
  AgentOutput,
  AgentReasoning,
  AgentExecution,
  TokenUsage,
  AgentToolCall,
  AgentToolDefinition,
  AgentToolParameter,
  AgentToolExecutor,
  AgentToolContext,
  AgentToolResult,
};
```

## 附录 B：DI Token 注册模板

```typescript
// container.ts 新增 Category F

// ── F. Agent Runtime（有状态，模块通过 Port 接口解耦） ──────────────
agentRuntime: createToken<IAgentRuntime>("agentRuntime", () => {
  const textProvider = container.textProvider;
  const toolRegistry = new ToolRegistry();
  const contextManager = new ContextManager();
  return new AgentRuntime(textProvider, toolRegistry, contextManager);
}),
toolRegistry: createToken<ToolRegistry>("toolRegistry", () => {
  return (container.agentRuntime as AgentRuntime).toolRegistry;
}),
contextManager: createToken<ContextManager>("contextManager", () => {
  return (container.agentRuntime as AgentRuntime).contextManager;
}),
```

## 附录 C：contract.json 变更示例

```json
{
  "name": "story-planning-agent",
  "description": "故事规划 Agent，替代规则引擎的机械重试，实现理解性迭代",
  "dependencies": [
    "@/domain/ports/agent-port",
    "@/infrastructure/di",
    "@/modules/story/planning/services"
  ],
  "publicAPI": [
    "StoryPlanningAgent",
    "StoryPlanningInput",
    "StoryPlanningAgentConfig"
  ],
  "invariants": [
    "Agent 失败时必须降级到 generateStoryPlanWithValidation",
    "Agent 生成结果必须通过 validateStoryPlanOutput 校验",
    "Agent 每次调用 Token 消耗不超过 8000",
    "Agent 迭代次数不超过 10",
    "save_draft 工具调用前必须通过校验"
  ]
}
```
