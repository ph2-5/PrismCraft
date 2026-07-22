<!-- AI: Before modifying this module, read contract.json for invariants -->
# consistency-qc 子域（Task 2A.23）

## 职责

视频生成完成后的自动一致性 QC 闭环：
1. 视频完成 → 自动抽帧 → face/visual embedding → 与角色参考图比对 → 生成 QCReport
2. 按 verdict（pass / drift_warning / drift_critical）触发动作：重生成 / face-swap / 标记人工审核
3. 按分镜类型（continuous_action / angle_switch / scene_transition）应用不同的连续性策略

## 设计策略：VLM 优先 + face embedding 可插拔

- **主路径**：VLM 视觉一致性检查（复用 `@/modules/shot/consistency-check` 的 `checkVisualConsistency`）
- **可选增强**：face embedding（当 ONNX face 模型可用时激活，提供帧级相似度曲线）
- **降级**：VLM 不可用时退化为纯跨分镜漂移检测（`checkCrossShotConsistency`）

## 文件结构

```
src/modules/video/consistency-qc/
├── index.ts                          → Barrel
├── MODULE.md                         → 本文件
├── contract.json                     → 模块契约
├── domain/
│   ├── qc-schema.ts                  → QCReport / FrameScore / Verdict / ActionTaken 类型
│   ├── shot-strategy.ts              → ShotStrategy 联合类型 + 工厂函数
│   └── drift-policy.ts               → DriftPolicy 阈值 + 默认值
├── services/
│   ├── face-embedding-service.ts     → face/visual embedding 抽象（VLM + ONNX 可插拔）
│   ├── similarity-checker.ts         → 帧 embedding vs 参考 embedding 余弦相似度
│   ├── qc-orchestrator.ts            → QC 编排（抽帧 → embedding → 比对 → 判定 → 触发动作）
│   ├── shot-strategy-router.ts       → 按 shotType 选择连续性策略
│   └── fallback-dispatcher.ts        → 超差帧调度（重生成 / face-swap / 标记人工审核）
└── presentation/
    ├── QCDashboardPanel.tsx          → QC 总览面板
    ├── FrameSimilarityChart.tsx      → 帧级相似度曲线图（纯 SVG）
    ├── ShotStrategyBadge.tsx         → 分镜策略标签
    ├── DriftAlertCard.tsx            → 超差告警卡片
    └── QCSettingsPanel.tsx           → 阈值设置面板
```

## 公共 API

### Domain 层

```typescript
// qc-schema.ts
type Verdict = 'pass' | 'drift_warning' | 'drift_critical'
type ActionTaken = 'none' | 'regenerated' | 'face_swapped' | 'manual_review'
interface FrameScore { frameIndex, timestamp, cosineSimilarity, faceDetected }
interface QCReport { videoTaskId, characterId?, totalFrames, sampledFrames, frameScores, averageScore, minScore, verdict, actionTaken, createdAt, strategy? }
function createEmptyQCReport(videoTaskId): QCReport
function computeAggregates(frameScores): { averageScore, minScore }
function determineVerdict(minScore, policy): Verdict
function shouldTriggerFallback(verdict): boolean
function isQCReportComplete(report): boolean

// shot-strategy.ts
type ShotStrategyType = 'continuous_action' | 'angle_switch' | 'scene_transition'
type LastFrameUsage = 'none' | 'first' | 'last' | 'both'
interface ShotStrategy { type, useLastFrame, preferExtend?, asSceneReference?, sceneRefOnly? }
function inferStrategyFromShotType(shotType): ShotStrategy
function createStrategy(overrides?): ShotStrategy
function describeStrategy(strategy): string
function getStrategyThresholdMultiplier(strategy): number
function usesLastFrame(strategy): boolean
function isContinuousAction(strategy): boolean

// drift-policy.ts
interface DriftPolicy { warningThreshold, criticalThreshold, maxRegenerateAttempts, fallbackToFaceSwap, autoMarkManualReview }
const DEFAULT_DRIFT_POLICY: DriftPolicy
function resolvePolicy(overrides?): DriftPolicy
function validatePolicy(policy): Result<DriftPolicy>
function shouldFallbackToFaceSwap(policy): boolean
function shouldMarkManualReview(policy): boolean
```

### Services 层

```typescript
// face-embedding-service.ts
interface FaceEmbeddingProvider {
  isAvailable(): Promise<boolean>
  extractEmbedding(imageUrl: string): Promise<Result<number[]>>
}
function getFaceEmbeddingProvider(): FaceEmbeddingProvider
function clearFaceEmbeddingProviderCache(): void
function isFaceEmbeddingAvailable(): Promise<boolean>
function extractFaceEmbedding(imageUrl: string): Promise<Result<number[]>>

// similarity-checker.ts
function computeFrameSimilarity(frameEmbedding, referenceEmbedding): number
function checkFrameConsistency(frameEmbeddings, referenceEmbedding): FrameScore[]
function findWorstFrame(frameScores): FrameScore | null
function findWorstFrames(frameScores, n): FrameScore[]
function filterFramesWithFace(frameScores): FrameScore[]
function computeFrameStats(frameScores): FrameScoreStats

// qc-orchestrator.ts
function runQualityCheck(input: QCInput): Promise<QCReport>
function shouldTriggerFallback(report): boolean
function decideFallbackAction(report, policy): FallbackAction
function getFrameStats(report): FrameScoreStats
function shouldDispatchFallback(report, policy): boolean
interface QCInput { videoTaskId, videoUrl, characterRefImageUrl?, beatId?, policy? }

// shot-strategy-router.ts
function routeStrategy(beat): ShotStrategy
function applyStrategyToPrompt(strategy, prompt): string
function getEffectiveThreshold(strategy, policy): number
function describeRoutedStrategy(strategy): string
function shouldUseLastFrame(strategy): boolean
function getLastFrameUsage(strategy): LastFrameUsage
function isStrategyLocked(strategy): boolean
function buildStrategyAwarePrompt(strategy, prompt): string

// fallback-dispatcher.ts
function dispatchFallback(input: FallbackInput): Promise<FallbackResult>
function listFallbackHistory(report): FallbackAction[]
function isFallbackTerminal(action): boolean
function predictNextAction(report, policy): FallbackAction
```

### Presentation 层

```typescript
// QCDashboardPanel.tsx
interface QCDashboardPanelProps { videoTaskId, qcReport?, onRegenerate?, onFaceSwap?, onDismiss? }

// FrameSimilarityChart.tsx
interface FrameSimilarityChartProps { frameScores, warningThreshold, criticalThreshold }

// ShotStrategyBadge.tsx
interface ShotStrategyBadgeProps { strategy, onStrategyChange? }

// DriftAlertCard.tsx
interface DriftAlertCardProps { report, onRegenerate, onFaceSwap, onDismiss }

// QCSettingsPanel.tsx
interface QCSettingsPanelProps { policy, onPolicyChange }
```

## 依赖

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas` | `VideoTask`、`StoryBeat`、`GenerationAsset` |
| `@/modules/shot/consistency-check` | `checkVisualConsistency`（VLM 主路径） |
| `@/shared/embedding` | `cosineSimilarity`、`getLocalEmbeddingProvider`（face embedding 可选，代理导出） |
| `@/modules/ffmpeg-runner` | `generateThumbnail`、`executeFfmpeg`（抽帧） |
| `@/infrastructure/di` | `container.eventBus`、`container.generationAssetStorage` |
| `@/shared/error-logger` | `errorLogger` |
| `@/shared/event-types` | `DomainEvents.VIDEO_TASK_COMPLETED` |
| `../partial-edit` | `startPartialEditTask`（face-swap fallback，可选） |
| `../task-management` | `useVideoTaskStore`（重生成） |

## 边界约束

1. **异步非阻塞**：QC 异步执行，不阻塞 UI，用户可在 QC 完成前预览视频
2. **可插拔 embedding**：face embedding 不可用时降级为 VLM 检查
3. **QC 结果不可变**：QCReport 一旦生成不修改，新 QC 生成新 report
4. **重试有上限**：maxRegenerateAttempts 默认 2 次，超过走 face-swap
5. **face-swap 是可选能力**：provider 不支持时直接标记 manual_review
6. **不修改原视频**：QC 仅读取视频帧，重生成/face-swap 创建新 VideoTask

## 不变量（Invariants）

### INV-1: QC 异步非阻塞
QC 编排器异步执行，不阻塞 VideoTask 完成回调。用户可在 QC 完成前预览视频，QC 完成后通过 eventBus 通知 UI 更新。

### INV-2: Embedding provider 可插拔
face-embedding-service 通过 `FaceEmbeddingProvider` 接口抽象，支持多种实现：
- VLM provider（默认，复用 `checkVisualConsistency`）
- ONNX face embedding provider（可选，当模型可用时激活）
- 不支持时返回 `isAvailable() = false`，qc-orchestrator 降级为 VLM 检查

### INV-3: Verdict 由阈值决定
`determineVerdict(minScore, policy)` 严格按 `policy.criticalThreshold` / `policy.warningThreshold` 判定：
- minScore >= warningThreshold → 'pass'
- minScore >= criticalThreshold → 'drift_warning'
- minScore < criticalThreshold → 'drift_critical'

### INV-4: 重试计数不可重置
`actionTaken` 字段记录最终采取的动作。同一 QCReport 不会从 'regenerated' 回退到 'none'。

### INV-5: ShotStrategy 不改 prompt 语义
`applyStrategyToPrompt` 仅追加约束指令（如"保持与上一镜尾帧一致"），不修改用户原始 prompt 内容。

### INV-6: QCReport 持久化于 StoryBeat
QC 完成后 report 存于 `StoryBeat.qcReport`（optional 字段），新 QC 覆盖旧 report。

### INV-7: Fallback 链式降级
`fallback-dispatcher` 按固定链路降级：regenerate → face-swap → manual_review。不可跳过 regenerate 直接 face-swap（除非 maxRegenerateAttempts=0）。

### INV-8: 不修改原视频
QC 仅读取视频帧进行比对，不修改原视频文件。regenerate / face-swap 均创建新的 VideoTask，原任务保持不变。

### INV-9: face embedding 走代理导出
face embedding 相关函数（`cosineSimilarity`、`getLocalEmbeddingProvider` 等）通过 `@/shared/embedding` 代理导出访问，不直接导入 `@/infrastructure/embedding`，保持依赖方向合规。

## AI 维护指南

- 修改本模块前必读 `contract.json` 中的 invariants
- 新增 embedding provider 时，实现 `FaceEmbeddingProvider` 接口并在 `getFaceEmbeddingProvider()` 注册
- 调整阈值时修改 `DEFAULT_DRIFT_POLICY`，不要在调用方硬编码阈值
- UI 组件变更时，确保 `QCDashboardPanel` 的 props 接口稳定
