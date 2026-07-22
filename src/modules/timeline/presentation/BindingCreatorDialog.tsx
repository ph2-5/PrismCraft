/**
 * Q3-7 / Task 4.6.5 — 绑定创建对话框
 *
 * 创建时间线绑定：选择来源/目标节点 + 10 种绑定类型 + 描述 + 注入文本 + 重要程度 + 级联传播。
 * 使用自建 Modal 组件，遵循 a11y 规范。
 */

import { useState, useCallback } from "react";
import { t } from "@/shared/constants";
import { cn } from "@/shared/utils/utils";
import { Modal } from "@/shared/presentation/Modal";
import type { PlotNodeLike } from "@/shared-logic/timeline";
import type { BindingType, BindingImportance } from "@/shared-logic/timeline";

const BINDING_TYPES: BindingType[] = [
  "foreshadow",
  "cause_effect",
  "character_arc",
  "scene_continuity",
  "emotional_buildup",
  "mystery_reveal",
  "parallel",
  "callback",
  "irony",
  "user_manual",
];

const IMPORTANCES: BindingImportance[] = ["critical", "important", "optional"];

export interface BindingCreatorResult {
  sourceNodeId: string;
  targetNodeId: string;
  type: BindingType;
  description: string;
  injectionText: string;
  importance: BindingImportance;
  cascadeEffect: boolean;
  autoInject: boolean;
}

interface BindingCreatorDialogProps {
  open: boolean;
  onClose: () => void;
  nodes: PlotNodeLike[];
  /** 默认来源节点 ID（可选） */
  defaultSourceNodeId?: string;
  /** 默认目标节点 ID（可选） */
  defaultTargetNodeId?: string;
  onCreate: (result: BindingCreatorResult) => void;
}

export function BindingCreatorDialog({
  open,
  onClose,
  nodes,
  defaultSourceNodeId,
  defaultTargetNodeId,
  onCreate,
}: BindingCreatorDialogProps) {
  const [sourceNodeId, setSourceNodeId] = useState(defaultSourceNodeId ?? "");
  const [targetNodeId, setTargetNodeId] = useState(defaultTargetNodeId ?? "");
  const [bindingType, setBindingType] = useState<BindingType>("foreshadow");
  const [description, setDescription] = useState("");
  const [injectionText, setInjectionText] = useState("");
  const [importance, setImportance] = useState<BindingImportance>("important");
  const [cascadeEffect, setCascadeEffect] = useState(false);
  const [autoInject, setAutoInject] = useState(true);

  const handleSubmit = useCallback(() => {
    if (!sourceNodeId || !targetNodeId || !injectionText.trim()) return;
    onCreate({
      sourceNodeId,
      targetNodeId,
      type: bindingType,
      description,
      injectionText,
      importance,
      cascadeEffect,
      autoInject,
    });
    onClose();
  }, [sourceNodeId, targetNodeId, bindingType, description, injectionText, importance, cascadeEffect, autoInject, onCreate, onClose]);

  const canSubmit = sourceNodeId && targetNodeId && sourceNodeId !== targetNodeId && injectionText.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t("timeline.bindingDialog.title")}
      className="max-w-[560px]"
    >
      <div className="p-4 flex flex-col gap-3">
        <h2 className="text-[14px] font-semibold">{t("timeline.bindingDialog.title")}</h2>

        {/* 来源节点 */}
        <div>
          <label className="section-label">{t("timeline.bindingDialog.sourceNode")}</label>
          <select
            className="select w-full mt-1"
            value={sourceNodeId}
            onChange={(e) => setSourceNodeId(e.target.value)}
          >
            <option value="">{t("timeline.bindingDialog.selectNode")}</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {t("timeline.editor.nodeN", { n: n.order + 1 })} · {n.plotEventDescription}
              </option>
            ))}
          </select>
        </div>

        {/* 目标节点 */}
        <div>
          <label className="section-label">{t("timeline.bindingDialog.targetNode")}</label>
          <select
            className="select w-full mt-1"
            value={targetNodeId}
            onChange={(e) => setTargetNodeId(e.target.value)}
          >
            <option value="">{t("timeline.bindingDialog.selectNode")}</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {t("timeline.editor.nodeN", { n: n.order + 1 })} · {n.plotEventDescription}
              </option>
            ))}
          </select>
        </div>

        {/* 绑定类型 */}
        <div>
          <label className="section-label">{t("timeline.bindingDialog.bindingType")}</label>
          <div className="grid grid-cols-2 gap-1 mt-1">
            {BINDING_TYPES.map((bt) => (
              <button
                key={bt}
                type="button"
                onClick={() => setBindingType(bt)}
                className={cn(
                  "text-[11px] px-2 py-1 rounded-[6px] border text-left transition-colors",
                  bindingType === bt
                    ? "border-[var(--primary)] bg-[rgba(var(--primary-rgb),0.1)] text-[var(--fg)]"
                    : "border-[var(--border)] bg-[var(--card2)] text-[var(--muted-fg)] hover:border-[var(--primary)]",
                )}
              >
                {t(`timeline.binding.type.${bt}`)}
              </button>
            ))}
          </div>
        </div>

        {/* 描述 */}
        <div>
          <label className="section-label">{t("timeline.bindingDialog.description")}</label>
          <textarea
            className="input w-full mt-1 min-h-[40px] resize-y"
            placeholder={t("timeline.bindingDialog.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* 注入文本 */}
        <div>
          <label className="section-label">{t("timeline.bindingDialog.injectionText")}</label>
          <textarea
            className="input w-full mt-1 min-h-[60px] resize-y"
            placeholder={t("timeline.bindingDialog.injectionTextPlaceholder")}
            value={injectionText}
            onChange={(e) => setInjectionText(e.target.value)}
          />
        </div>

        {/* 重要程度 */}
        <div>
          <label className="section-label">{t("timeline.bindingDialog.importance")}</label>
          <div className="flex gap-2 mt-1">
            {IMPORTANCES.map((imp) => (
              <button
                key={imp}
                type="button"
                onClick={() => setImportance(imp)}
                className={cn(
                  "text-[11px] px-3 py-1 rounded-[6px] border transition-colors",
                  importance === imp
                    ? "border-[var(--primary)] bg-[rgba(var(--primary-rgb),0.1)] text-[var(--fg)]"
                    : "border-[var(--border)] bg-[var(--card2)] text-[var(--muted-fg)] hover:border-[var(--primary)]",
                )}
              >
                {t(`timeline.binding.importance.${imp}`)}
              </button>
            ))}
          </div>
        </div>

        {/* 级联传播 + 自动注入 */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cascadeEffect}
              onChange={(e) => setCascadeEffect(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            <span className="text-[11px]">{t("timeline.bindingDialog.cascadeEffect")}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoInject}
              onChange={(e) => setAutoInject(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            <span className="text-[11px]">{t("timeline.bindingDialog.autoInject")}</span>
          </label>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 mt-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("timeline.bindingDialog.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {t("timeline.bindingDialog.create")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
