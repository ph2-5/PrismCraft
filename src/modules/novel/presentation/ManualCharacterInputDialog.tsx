/**
 * v5.2 角色管理重构 — 手动预填角色弹窗
 *
 * 用户在 AI 提取前可手动输入记忆中的角色（姓名+简述），创建到 DB 角色库。
 * 适合：开始就先确定主要角色，后续 AI 提取补充细节。
 *
 * 表单字段（最小集，其他字段由 AI 提取后补充）：
 * - 姓名（必填）
 * - 性别（可选）
 * - 年龄（可选）
 * - 简述（可选，一句话描述）
 */

import { useState, useEffect } from "react";
import { X, UserPlus } from "lucide-react";
import { t } from "@/shared/constants";
import { genderSuggestions } from "@/modules/character";

export interface ManualCharacterInput {
  name: string;
  gender: string;
  age?: number;
  description: string;
}

export interface ManualCharacterInputDialogProps {
  open: boolean;
  onClose: () => void;
  /** 提交回调（同步返回输入值，由调用方负责创建到 DB） */
  onSubmit: (input: ManualCharacterInput) => void;
  /** 已存在的角色名列表（用于去重提示） */
  existingNames?: string[];
}

export function ManualCharacterInputDialog({
  open,
  onClose,
  onSubmit,
  existingNames = [],
}: ManualCharacterInputDialogProps) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  // 弹窗打开时重置表单
  useEffect(() => {
    if (open) {
      setName("");
      setGender("");
      setAge("");
      setDescription("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("novel.character.manual.nameRequired"));
      return;
    }
    if (existingNames.includes(trimmedName)) {
      setError(t("novel.character.manual.nameExists"));
      return;
    }
    const ageNum = age.trim() ? Number(age) : undefined;
    if (ageNum !== undefined && (Number.isNaN(ageNum) || ageNum <= 0)) {
      setError(t("novel.character.manual.ageInvalid"));
      return;
    }
    onSubmit({
      name: trimmedName,
      gender: gender || "unknown",
      age: ageNum,
      description: description.trim(),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="card w-[420px] max-w-[90vw] p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus size={14} />
            <span className="text-[13px] font-bold">
              {t("novel.character.manual.title")}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-xs"
            aria-label={t("common.close")}
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {t("novel.character.manual.hint")}
        </p>

        {/* 表单 */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label className="section-label !text-[11px]">
              {t("novel.character.manual.nameLabel")} *
            </label>
            <input
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder={t("novel.character.manual.namePlaceholder")}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="section-label !text-[11px]">
                {t("novel.character.manual.genderLabel")}
              </label>
              <select
                className="select"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">{t("character.custom")}</option>
                {genderSuggestions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="section-label !text-[11px]">
                {t("novel.character.manual.ageLabel")}
              </label>
              <input
                className="input"
                type="number"
                min={1}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder={t("novel.character.manual.agePlaceholder")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="section-label !text-[11px]">
              {t("novel.character.manual.descriptionLabel")}
            </label>
            <textarea
              className="textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("novel.character.manual.descriptionPlaceholder")}
            />
          </div>

          {error && (
            <div className="text-[11px] text-destructive">{error}</div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn btn-primary btn-sm"
          >
            {t("novel.character.manual.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
