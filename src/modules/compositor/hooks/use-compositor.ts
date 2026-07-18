/**
 * Task 2A.9 — useCompositor Hook
 *
 * 管理 Compositor 状态：
 *   - 图层列表（character/scene/prop 拖入画布后的节点）
 *   - 当前选中的图层
 *   - extraPrompt（用户自定义补充提示词）
 *   - 生成状态（idle/building-prompt/generating/saving/success/error）
 *   - 生成结果（最近一次）
 *   - 错误信息
 *
 * 提供 actions：
 *   - addLayer(entity)       添加图层
 *   - removeLayer(layerId)   移除图层
 *   - moveLayer(layerId, x, y) 移动图层
 *   - selectLayer(layerId)   选中图层
 *   - clearCanvas()          清空画布
 *   - updateLayerScale(layerId, scale) 缩放图层
 *   - setExtraPrompt(text)   设置额外提示词
 *   - setProvider(id)/setModelId(id)  设置 AI 提供商/模型
 *   - setResolution(text)    设置分辨率
 *   - generate()             触发生成
 *   - reset()                重置状态
 *   - loadPreset(preset)     加载预设
 *   - buildPrompt()          预览当前 prompt（不调用模型）
 *
 * 参考实现：use-keyframe-generator.ts（callback + 状态机模式）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { composeImage, buildCompositorPrompt, getCompositorErrorMessage } from "../services/compositor-engine";
import type {
  ComposerLayer,
  ComposerLayerType,
  CompositorStatus,
  CompositorResult,
  CompositorPreset,
} from "../domain/compositor.schema";
import type { Character, Scene, Prop } from "@/domain/schemas";
import { t } from "@/shared/constants/messages";

/** 图层 emoji 默认值 */
const LAYER_EMOJI: Record<ComposerLayerType, string> = {
  character: "👤",
  scene: "🏞",
  prop: "🎁",
};

export interface UseCompositorResult {
  // 状态
  layers: ComposerLayer[];
  selectedLayerId: string | null;
  extraPrompt: string;
  status: CompositorStatus;
  result: CompositorResult | null;
  error: string | null;
  provider: string | undefined;
  modelId: string | undefined;
  resolution: string | undefined;

  // 派生
  canGenerate: boolean;
  characterLayer: ComposerLayer | null;
  sceneLayer: ComposerLayer | null;
  propLayers: ComposerLayer[];

  // Actions
  addCharacterLayer: (character: Character) => void;
  addSceneLayer: (scene: Scene) => void;
  addPropLayer: (prop: Prop) => void;
  removeLayer: (layerId: string) => void;
  moveLayer: (layerId: string, x: number, y: number) => void;
  updateLayerScale: (layerId: string, scale: number) => void;
  selectLayer: (layerId: string | null) => void;
  clearCanvas: () => void;
  setExtraPrompt: (text: string) => void;
  setProvider: (id: string | undefined) => void;
  setModelId: (id: string | undefined) => void;
  setResolution: (r: string | undefined) => void;
  generate: () => Promise<void>;
  buildPrompt: () => Promise<string>;
  loadPreset: (preset: CompositorPreset) => void;
  reset: () => void;
}

// P1-7 修复：layerIdCounter 从模块级移到实例级（useRef），避免多实例共享计数器
// 模块级仅保留时间戳前缀函数，确保全局唯一性
function createLayerId(instanceCounter: number): string {
  return `composer-layer-${Date.now()}-${instanceCounter}`;
}

export function useCompositor(): UseCompositorResult {
  const [layers, setLayers] = useState<ComposerLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [status, setStatus] = useState<CompositorStatus>("idle");
  const [result, setResult] = useState<CompositorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [modelId, setModelId] = useState<string | undefined>(undefined);
  const [resolution, setResolution] = useState<string | undefined>(undefined);

  const abortRef = useRef<AbortController | null>(null);
  const layerIdCounterRef = useRef(0);
  const isMountedRef = useRef(true);

  // P1-7 修复：组件卸载时取消进行中的生成，并标记已卸载（防止 setState after unmount）
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const nextLayerId = useCallback((): string => {
    layerIdCounterRef.current += 1;
    return createLayerId(layerIdCounterRef.current);
  }, []);

  const characterLayer = useMemo(
    () => layers.find((l) => l.type === "character") ?? null,
    [layers],
  );
  const sceneLayer = useMemo(
    () => layers.find((l) => l.type === "scene") ?? null,
    [layers],
  );
  const propLayers = useMemo(
    () => layers.filter((l) => l.type === "prop"),
    [layers],
  );
  const canGenerate = characterLayer !== null && status !== "generating" && status !== "building-prompt" && status !== "saving";

  const addLayerInternal = useCallback((entity: { id: string; name: string }, type: ComposerLayerType) => {
    setLayers((prev) => {
      // 角色与场景单实例：替换已有
      if (type === "character" || type === "scene") {
        const filtered = prev.filter((l) => l.type !== type);
        const newLayer: ComposerLayer = {
          layerId: nextLayerId(),
          id: entity.id,
          type,
          name: entity.name,
          emoji: LAYER_EMOJI[type],
          x: 50,
          y: 50,
          scale: 1,
          zIndex: type === "scene" ? 1 : 10,
        };
        return [...filtered, newLayer];
      }
      // 道具：可多个，去重
      if (prev.some((l) => l.type === "prop" && l.id === entity.id)) {
        return prev;
      }
      const newLayer: ComposerLayer = {
        layerId: nextLayerId(),
        id: entity.id,
        type,
        name: entity.name,
        emoji: LAYER_EMOJI[type],
        x: 50 + prev.length * 20,
        y: 50 + prev.length * 20,
        scale: 1,
        zIndex: 20,
      };
      return [...prev, newLayer];
    });
  }, [nextLayerId]);

  const addCharacterLayer = useCallback(
    (character: Character) => addLayerInternal(character, "character"),
    [addLayerInternal],
  );
  const addSceneLayer = useCallback(
    (scene: Scene) => addLayerInternal(scene, "scene"),
    [addLayerInternal],
  );
  const addPropLayer = useCallback(
    (prop: Prop) => addLayerInternal(prop, "prop"),
    [addLayerInternal],
  );

  const removeLayer = useCallback((layerId: string) => {
    setLayers((prev) => prev.filter((l) => l.layerId !== layerId));
    setSelectedLayerId((curr) => (curr === layerId ? null : curr));
  }, []);

  const moveLayer = useCallback((layerId: string, x: number, y: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.layerId === layerId ? { ...l, x, y } : l)),
    );
  }, []);

  const updateLayerScale = useCallback((layerId: string, scale: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.layerId === layerId ? { ...l, scale } : l)),
    );
  }, []);

  const selectLayer = useCallback((layerId: string | null) => {
    setSelectedLayerId(layerId);
  }, []);

  const clearCanvas = useCallback(() => {
    // P1-7 修复：清空画布时取消进行中的生成，避免结果落地到已清空的画布
    abortRef.current?.abort();
    abortRef.current = null;
    setLayers([]);
    setSelectedLayerId(null);
    setStatus("idle");
    setError(null);
    setResult(null);
  }, []);

  const buildPrompt = useCallback(async (): Promise<string> => {
    if (!characterLayer) {
      throw new Error(t("compositor.errorSelectCharacter"));
    }
    return buildCompositorPrompt({
      characterId: characterLayer.id,
      propIds: propLayers.map((p) => p.id),
      sceneId: sceneLayer?.id,
      extraPrompt: extraPrompt || undefined,
    });
  }, [characterLayer, propLayers, sceneLayer, extraPrompt]);

  const generate = useCallback(async () => {
    if (!characterLayer) {
      setError("请先选择角色");
      setStatus("error");
      return;
    }
    // 取消上一次
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("building-prompt");
    setError(null);
    try {
      // 进入 generating（composeImage 内部会先拼装 prompt）
      setStatus("generating");
      const res = await composeImage(
        {
          characterId: characterLayer.id,
          propIds: propLayers.map((p) => p.id),
          sceneId: sceneLayer?.id,
          extraPrompt: extraPrompt || undefined,
          provider,
          modelId,
          resolution,
        },
        { signal: controller.signal },
      );
      // P1-7 修复：组件卸载后或请求被取消后不再 setState
      if (controller.signal.aborted || !isMountedRef.current) return;
      setStatus("saving");
      setResult(res);
      setStatus("success");
    } catch (err) {
      if (!isMountedRef.current) return;
      if (controller.signal.aborted) {
        setStatus("idle");
        return;
      }
      setError(getCompositorErrorMessage(err));
      setStatus("error");
    }
  }, [characterLayer, propLayers, sceneLayer, extraPrompt, provider, modelId, resolution]);

  const loadPreset = useCallback((preset: CompositorPreset) => {
    setLayers([]);
    setSelectedLayerId(null);
    setExtraPrompt(preset.extraPrompt ?? "");
    // 注意：preset 只存 ID，需要调用方后续通过 addCharacterLayer 等重新加载实体
    // 这里只设置 extraPrompt 和标记，实际图层加载由 UI 层根据 preset.characterId/propIds/sceneId 完成
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setLayers([]);
    setSelectedLayerId(null);
    setExtraPrompt("");
    setStatus("idle");
    setResult(null);
    setError(null);
    setProvider(undefined);
    setModelId(undefined);
    setResolution(undefined);
  }, []);

  return {
    layers,
    selectedLayerId,
    extraPrompt,
    status,
    result,
    error,
    provider,
    modelId,
    resolution,
    canGenerate,
    characterLayer,
    sceneLayer,
    propLayers,
    addCharacterLayer,
    addSceneLayer,
    addPropLayer,
    removeLayer,
    moveLayer,
    updateLayerScale,
    selectLayer,
    clearCanvas,
    setExtraPrompt,
    setProvider,
    setModelId,
    setResolution,
    generate,
    buildPrompt,
    loadPreset,
    reset,
  };
}
