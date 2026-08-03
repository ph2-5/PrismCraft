/**
 * Phase 7 节点化工作流 — 预设模板
 *
 * 三个模板：一键成片 / 分镜优先 / 质量优先。
 * 模板是纯数据（Workflow），用户可加载后修改。
 */
import type { Workflow } from "../domain/workflow-schema";

let tplSeq = 0;
function nid(prefix: string): string {
  tplSeq += 1;
  return `${prefix}-${tplSeq}`;
}

/** 一键成片：小说导入 → 角色提取 → 场景提取 → 分镜拆解 → 视频生成 */
export function createOneClickFilmTemplate(): Workflow {
  const novel = nid("input");
  const chars = nid("process");
  const scenes = nid("process");
  const shots = nid("process");
  const video = nid("output");
  return {
    id: "tpl-one-click",
    name: "一键成片",
    description: "小说/剧本导入后自动提取角色与场景、拆解分镜并生成视频",
    nodes: [
      { id: novel, kind: "input", subtype: "novel", label: "小说导入", config: { text: "" }, position: { x: 40, y: 60 } },
      { id: chars, kind: "process", subtype: "character-extract", label: "角色提取", config: {}, position: { x: 300, y: 20 } },
      { id: scenes, kind: "process", subtype: "scene-extract", label: "场景提取", config: {}, position: { x: 300, y: 140 } },
      { id: shots, kind: "process", subtype: "shot-breakdown", label: "分镜拆解", config: {}, position: { x: 560, y: 80 } },
      { id: video, kind: "output", subtype: "video-generate", label: "视频生成", config: { modelId: "" }, position: { x: 820, y: 80 } },
    ],
    edges: [
      { id: nid("edge"), source: novel, target: chars },
      { id: nid("edge"), source: novel, target: scenes },
      { id: nid("edge"), source: chars, target: shots },
      { id: nid("edge"), source: scenes, target: shots },
      { id: nid("edge"), source: shots, target: video },
    ],
  };
}

/** 分镜优先：文本 → Prompt 生成 → 视频生成 */
export function createShotFirstTemplate(): Workflow {
  const text = nid("input");
  const prompt = nid("process");
  const video = nid("output");
  return {
    id: "tpl-shot-first",
    name: "分镜优先",
    description: "手动输入分镜描述，生成 Prompt 后逐个生成视频",
    nodes: [
      { id: text, kind: "input", subtype: "prompt", label: "分镜描述", config: { text: "" }, position: { x: 40, y: 80 } },
      { id: prompt, kind: "process", subtype: "prompt-generate", label: "Prompt 生成", config: { prompt: "请将以下分镜描述扩展为完整的视频生成提示词", modelId: "" }, position: { x: 320, y: 80 } },
      { id: video, kind: "output", subtype: "video-generate", label: "视频生成", config: { modelId: "" }, position: { x: 620, y: 80 } },
    ],
    edges: [
      { id: nid("edge"), source: text, target: prompt },
      { id: nid("edge"), source: prompt, target: video },
    ],
  };
}

/** 质量优先：文本 → Prompt → 一致性检查 → 视频生成 */
export function createQualityFirstTemplate(): Workflow {
  const text = nid("input");
  const prompt = nid("process");
  const check = nid("process");
  const video = nid("output");
  return {
    id: "tpl-quality-first",
    name: "质量优先",
    description: "生成 Prompt 后执行一致性检查，通过后再生成视频",
    nodes: [
      { id: text, kind: "input", subtype: "prompt", label: "内容输入", config: { text: "" }, position: { x: 40, y: 80 } },
      { id: prompt, kind: "process", subtype: "prompt-generate", label: "Prompt 生成", config: { prompt: "生成高质量视频提示词", modelId: "" }, position: { x: 320, y: 80 } },
      { id: check, kind: "process", subtype: "consistency-check", label: "一致性检查", config: {}, position: { x: 560, y: 80 } },
      { id: video, kind: "output", subtype: "video-generate", label: "视频生成", config: { modelId: "" }, position: { x: 800, y: 80 } },
    ],
    edges: [
      { id: nid("edge"), source: text, target: prompt },
      { id: nid("edge"), source: prompt, target: check },
      { id: nid("edge"), source: check, target: video },
    ],
  };
}

export const WORKFLOW_TEMPLATES: Array<{ id: string; name: string; description: string; create: () => Workflow }> = [
  { id: "one-click", name: "一键成片", description: "小说 → 角色/场景 → 分镜 → 视频", create: createOneClickFilmTemplate },
  { id: "shot-first", name: "分镜优先", description: "分镜描述 → Prompt → 视频", create: createShotFirstTemplate },
  { id: "quality-first", name: "质量优先", description: "内容 → Prompt → 一致性检查 → 视频", create: createQualityFirstTemplate },
];
