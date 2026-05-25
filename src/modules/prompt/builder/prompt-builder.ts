import type {
  ShotInstructionTemplate,
  StoryElement,
  FeatureAnchoringConfig,
  ShotReference,
  StoryBeat,
} from "@/domain/schemas";
import { shotInstructionToPrompt } from "@/domain/utils";

export class PromptBuilder {
  buildGlobalElementDefinitions(elements: StoryElement[]): string {
    if (!elements || elements.length === 0) return "";

    const parts: string[] = [];
    parts.push("【全局元素定义 - 跨分镜保持一致】");
    parts.push("以下元素编号为全局唯一标识，所有分镜中同一编号必须保持完全一致的外观、风格、配色。仅允许角度、动作、位置变化，不允许外观特征变化。");
    parts.push("");

    for (const element of elements) {
      const typeLabel =
        element.type === "character"
          ? "角色"
          : element.type === "prop"
            ? "道具"
            : "特效";

      parts.push(`${element.id}（${typeLabel}）：${element.name}`);

      if (element.type === "character" && element.characterConfig?.appearance) {
        const app = element.characterConfig.appearance;
        const appearanceParts: string[] = [];
        if (app.hairColor) appearanceParts.push(`${app.hairColor}发色`);
        if (app.hairStyle) appearanceParts.push(`${app.hairStyle}发型`);
        if (app.eyeColor) appearanceParts.push(`${app.eyeColor}眼睛`);
        if (app.build) appearanceParts.push(`${app.build}身材`);
        if (app.clothing) appearanceParts.push(`穿着${app.clothing}`);
        if (appearanceParts.length > 0) {
          parts.push(`  外观：${appearanceParts.join("、")}`);
        }
      }

      if (element.type === "prop" && element.description) {
        parts.push(`  外观：${element.description}`);
      }

      const imageBinding = element.bindings?.find((b) => b.type === "image");
      if (imageBinding?.url) {
        parts.push(`  参考图：${imageBinding.url}`);
        parts.push(`  一致性约束：严格继承参考图中的全部视觉特征，包括颜色、材质、形状、比例`);
      }

      if (element.featureAnchor) {
        const anchor = element.featureAnchor;
        if (anchor.featureTags.length > 0) {
          parts.push(`  核心特征：${anchor.featureTags.join("、")}`);
        }
        if (anchor.confidence > 0) {
          parts.push(`  特征置信度：${Math.round(anchor.confidence * 100)}%`);
        }
      }

      parts.push("");
    }

    return parts.join("\n");
  }

  buildFeatureAnchoredPrompt(
    shot: StoryBeat,
    elements: StoryElement[],
    featureAnchoring: FeatureAnchoringConfig,
    shotInstruction?: ShotInstructionTemplate,
  ): string {
    const parts: string[] = [];

    const globalElements = this.buildGlobalElementDefinitions(elements);
    if (globalElements) {
      parts.push(globalElements);
    }

    parts.push("【特征锚定型独立生成】");
    parts.push(
      `独立生成第${shot.sequence}分镜，参考图仅做特征锚点，不绑定任何帧`,
    );
    parts.push("");

    parts.push("【特征锚定约束】");
    for (const anchor of featureAnchoring.characterAnchors) {
      const featureDesc =
        anchor.featureTags.length > 0
          ? `核心特征：${anchor.featureTags.join("、")}。`
          : "";
      parts.push(
        `角色参考图：严格继承参考图中角色的外观、脸型、发型、服装、配色等全部视觉特征。${featureDesc}仅约束外观和风格，不约束动作姿态和镜头位置。一致性权重：${Math.round(anchor.weight * 100)}%`,
      );
    }
    if (featureAnchoring.previewImageUrl) {
      parts.push(
        `分镜预览图：作为本分镜的构图和画面参考，帮助理解镜头构图、角色位置和场景布局，但不作为首帧或尾帧绑定。`,
      );
    }
    parts.push("");

    if (shotInstruction) {
      parts.push("【镜头指令】");
      parts.push(shotInstructionToPrompt(shotInstruction));
      parts.push("");
    }

    parts.push("【本分镜元素使用】");
    const shotElements = this.getBoundElements(shot, elements);
    for (const element of shotElements) {
      parts.push(this.expandElementUsage(element, shot));
    }
    parts.push("");

    parts.push("【镜头内容】");
    parts.push(this.buildCameraDescription(shot));
    parts.push("");

    if (shot.promptLayers) {
      parts.push("【提示词层级】");
      if (shot.promptLayers.coreElements)
        parts.push("核心元素：" + shot.promptLayers.coreElements);
      if (shot.promptLayers.cameraAction)
        parts.push("镜头动作：" + shot.promptLayers.cameraAction);
      if (shot.promptLayers.styleAtmosphere)
        parts.push("风格氛围：" + shot.promptLayers.styleAtmosphere);
      parts.push("");
    }

    parts.push("【一致性约束】");
    parts.push("参考图仅约束角色外观和风格，不绑定帧、不约束动作和镜头时序");
    parts.push("预览图作为构图参考传入，但不作为首帧或尾帧");
    parts.push(
      "本分镜独立生成，不依赖其他分镜结果，仅通过全局元素锚点实现风格统一",
    );
    parts.push(
      `特征一致性强度：${Math.round(featureAnchoring.featureConsistencyStrength * 100)}%，帧绑定：已禁用`,
    );

    return parts.join("\n");
  }

  buildFirstShotPrompt(shot: StoryBeat, elements: StoryElement[]): string {
    const parts: string[] = [];

    const globalElements = this.buildGlobalElementDefinitions(elements);
    if (globalElements) {
      parts.push(globalElements);
    }

    parts.push("【全局风格约束】");
    parts.push("保持画面风格一致，作为全部分镜的视觉基准");
    parts.push("");

    parts.push("【本分镜元素使用】");
    const shotElements = this.getBoundElements(shot, elements);
    for (const element of shotElements) {
      parts.push(this.expandElementUsage(element, shot));
    }
    parts.push("");

    parts.push("【镜头描述】");
    parts.push(this.buildCameraDescription(shot));
    parts.push("");

    parts.push("【基准声明】");
    parts.push("本镜为全部分镜视觉基准，请确保画面质量高、细节清晰");

    return parts.join("\n");
  }

  buildInheritancePrompt(
    shot: StoryBeat,
    elements: StoryElement[],
    previousShot: StoryBeat,
  ): string {
    const parts: string[] = [];

    const globalElements = this.buildGlobalElementDefinitions(elements);
    if (globalElements) {
      parts.push(globalElements);
    }

    parts.push("【继承约束】");
    parts.push(`完全继承第${previousShot.sequence}分镜的元素外观、风格、光影`);
    parts.push("");

    parts.push("【本分镜元素使用】");
    const shotElements = this.getBoundElements(shot, elements);
    for (const element of shotElements) {
      parts.push(this.expandElementUsage(element, shot));
    }
    parts.push("");

    parts.push("【镜头变化】");
    parts.push(this.buildCameraDescription(shot));

    return parts.join("\n");
  }

  buildIndependentShotPrompt(
    shot: StoryBeat,
    elements: StoryElement[],
    reference?: ShotReference,
    referenceShot?: StoryBeat,
  ): string {
    const parts: string[] = [];

    const globalElements = this.buildGlobalElementDefinitions(elements);
    if (globalElements) {
      parts.push(globalElements);
    }

    parts.push("【独立生成】");
    parts.push(`独立生成第${shot.sequence}分镜`);
    parts.push("");

    parts.push("【本分镜元素使用】");
    const shotElements = this.getBoundElements(shot, elements);
    for (const element of shotElements) {
      parts.push(this.expandElementUsage(element, shot));
    }
    parts.push("");

    if (reference && referenceShot) {
      parts.push("【引用规则】");
      parts.push(this.buildReferenceConstraint(reference, referenceShot));
      parts.push("");
    }

    parts.push("【镜头内容】");
    parts.push(this.buildCameraDescription(shot));
    parts.push("");

    parts.push("【一致性约束】");
    parts.push("保持与前后分镜的画面风格、光影、元素外观完全一致");

    return parts.join("\n");
  }

  buildCrossReferencePrompt(
    shot: StoryBeat,
    elements: StoryElement[],
    reference: ShotReference,
    referenceShot: StoryBeat,
  ): string {
    const parts: string[] = [];

    const globalElements = this.buildGlobalElementDefinitions(elements);
    if (globalElements) {
      parts.push(globalElements);
    }

    parts.push("【跨镜引用】");
    parts.push(this.buildReferenceDescription(reference, referenceShot));
    parts.push("");

    parts.push("【一致性约束】");
    parts.push("保持元素、光影、画面风格完全一致，无跳变、无穿帮");
    parts.push("");

    parts.push("【当前分镜】");
    const shotElements = this.getBoundElements(shot, elements);
    for (const element of shotElements) {
      parts.push(this.expandElementUsage(element, shot));
    }
    parts.push("");
    parts.push(this.buildCameraDescription(shot));

    return parts.join("\n");
  }

  private getBoundElements(
    shot: StoryBeat,
    elements: StoryElement[],
  ): StoryElement[] {
    return (shot.elementIds || [])
      .map((id) => elements.find((e) => e.id === id))
      .filter((e): e is StoryElement => !!e);
  }

  private expandElementUsage(
    element: StoryElement,
    shot: StoryBeat,
  ): string {
    const parts: string[] = [];
    const binding = shot.elementBindings?.[element.id];
    const typeLabel =
      element.type === "character"
        ? "角色"
        : element.type === "prop"
          ? "道具"
          : "特效";

    parts.push(`${element.id}（${typeLabel}）：${element.name}`);

    if (binding) {
      const usageParts: string[] = [];
      if (binding.position) usageParts.push(`位于${binding.position}`);
      if (binding.action) usageParts.push(`正在${binding.action}`);
      if (binding.emotion) usageParts.push(`表情${binding.emotion}`);
      if (binding.role) usageParts.push(`角色定位：${binding.role}`);
      if (binding.text) usageParts.push(`台词：${binding.text}`);
      if (usageParts.length > 0) {
        parts.push(`  本分镜表现：${usageParts.join("，")}`);
      }
      if (binding.description) {
        parts.push(`  详细说明：${binding.description}`);
      }
      if (binding.imageUrl) {
        parts.push(`  参考图片：${binding.imageUrl}（保持视觉特征一致）`);
      }
    }

    if (element.type === "character" && element.characterConfig?.appearance) {
      const app = element.characterConfig.appearance;
      const appearanceParts: string[] = [];
      if (app.hairColor) appearanceParts.push(`${app.hairColor}发色`);
      if (app.hairStyle) appearanceParts.push(`${app.hairStyle}发型`);
      if (app.eyeColor) appearanceParts.push(`${app.eyeColor}眼睛`);
      if (app.clothing) appearanceParts.push(`穿着${app.clothing}`);
      if (appearanceParts.length > 0) {
        parts.push(`  外观提醒：${appearanceParts.join("、")}（必须与全局定义一致）`);
      }
    }

    const imageBinding = element.bindings?.find((b) => b.type === "image");
    if (imageBinding?.url) {
      parts.push(`  参考图：${imageBinding.url}（严格继承视觉特征）`);
    }

    return parts.join("\n");
  }

  private buildCameraDescription(shot: StoryBeat): string {
    const parts: string[] = [];

    if (shot.camera) {
      const cameraObj =
        typeof shot.camera === "string"
          ? { movement: shot.camera }
          : shot.camera;
      if (cameraObj.angle) parts.push(`角度：${cameraObj.angle}`);
      if (cameraObj.movement) parts.push(`运镜：${cameraObj.movement}`);
      if (cameraObj.distance) parts.push(`距离：${cameraObj.distance}`);
    }

    if (shot.content || shot.description) {
      parts.push(`内容：${shot.content || shot.description}`);
    }

    if (shot.duration != null) {
      parts.push(`时长：${shot.duration}秒`);
    }

    return parts.join("，");
  }

  private buildReferenceConstraint(
    reference: ShotReference,
    referenceShot: StoryBeat,
  ): string {
    const parts: string[] = [];

    const directionText =
      reference.direction === "previous"
        ? "上一分镜"
        : reference.direction === "next"
          ? "下一分镜"
          : `第${referenceShot.sequence}分镜`;

    const contentTypeText =
      reference.contentType === "last_frame"
        ? "尾帧"
        : reference.contentType === "first_frame"
          ? "首帧"
          : reference.contentType === "video_segment"
            ? "视频片段"
            : "完整视频";

    parts.push(`引用来源：${directionText}`);
    parts.push(`引用内容：${contentTypeText}`);

    if (reference.segmentDuration) {
      parts.push(`片段时长：${reference.segmentDuration}秒`);
    }

    if (reference.segmentPosition) {
      parts.push(
        `片段位置：${reference.segmentPosition === "start" ? "开头" : "结尾"}`,
      );
    }

    parts.push("引用规则：仅继承画面风格、光影、元素外观，不继承动作和镜头运动");

    return parts.join("\n");
  }

  private buildReferenceDescription(
    reference: ShotReference,
    referenceShot: StoryBeat,
  ): string {
    const parts: string[] = [];

    const directionText =
      reference.direction === "previous"
        ? "上一分镜"
        : reference.direction === "next"
          ? "下一分镜"
          : reference.direction === "custom"
            ? `指定分镜（第${referenceShot.sequence}分镜）`
            : "无引用";

    parts.push(`引用方向：${directionText}`);

    const contentTypeText =
      reference.contentType === "last_frame"
        ? "尾帧画面"
        : reference.contentType === "first_frame"
          ? "首帧画面"
          : reference.contentType === "video_segment"
            ? "视频片段"
            : "完整视频";

    parts.push(`引用类型：${contentTypeText}`);

    if (reference.segmentDuration) {
      parts.push(`引用时长：${reference.segmentDuration}秒`);
    }

    parts.push(`被引用分镜内容：${referenceShot.content || referenceShot.description || "无描述"}`);

    return parts.join("\n");
  }
}

export const promptBuilder = new PromptBuilder();
