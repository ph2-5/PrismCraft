/**
 * 配方面板组件（Task 4.7）
 *
 * 展示预设配方列表，用户点击"应用"后调用 applyRecipe 生成指令片段，
 * 通过 onApply 回调将指令片段应用到分镜提示词。
 *
 * 配方库从静态数据升级为"Skill 调用"（Task 4.7 v5.3 增强）：
 * 每个配方对应一组 Skill 组合，应用时调用对应 Skill 构建指令片段。
 */

import { useState, useMemo } from "react";
import { Palette, Sparkles, Check } from "lucide-react";
import { t } from "@/shared/constants";
import {
  listRecipes,
  applyRecipe,
  getRecipeSkillIds,
  type RecipeId,
  type Recipe,
} from "./recipe-skill-mapper";

export interface PromptRecipePanelProps {
  /** 应用配方时回调，参数为生成的指令片段 */
  onApply?: (instruction: string, recipeId: RecipeId) => void;
  /** 当前已应用的配方 id（用于高亮） */
  appliedRecipeId?: RecipeId | null;
  /** 紧凑模式（在侧边栏使用） */
  compact?: boolean;
}

export function PromptRecipePanel({
  onApply,
  appliedRecipeId,
  compact = false,
}: PromptRecipePanelProps) {
  const [selectedId, setSelectedId] = useState<RecipeId | null>(appliedRecipeId ?? null);

  const recipes = useMemo(() => listRecipes(), []);

  const handleApply = (id: RecipeId) => {
    try {
      const instruction = applyRecipe(id);
      setSelectedId(id);
      onApply?.(instruction, id);
    } catch (err) {
      // 配方应用失败静默处理（不应发生，因为 id 来自预设列表）
      void err;
    }
  };

  return (
    <div
      className={`prompt-recipe-panel ${compact ? "compact" : ""}`}
      style={{
        border: "1px solid var(--border-color, #e5e7eb)",
        borderRadius: "8px",
        padding: compact ? "8px" : "16px",
        backgroundColor: "var(--bg-secondary, #fafafa)",
      }}
    >
      <div
        className="panel-header"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: compact ? "8px" : "12px",
        }}
      >
        <Palette className="w-4 h-4" style={{ color: "var(--accent-color, #6366f1)" }} />
        <h3
          style={{
            margin: 0,
            fontSize: compact ? "13px" : "14px",
            fontWeight: 600,
            color: "var(--text-primary, #111827)",
          }}
        >
          {t("prompt.recipePanelTitle")}
        </h3>
      </div>

      <div
        className="recipe-list"
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(200px, 1fr))",
          gap: compact ? "6px" : "8px",
        }}
      >
        {recipes.map((recipe: Recipe) => {
          const isActive = selectedId === recipe.id;
          const skillIds = getRecipeSkillIds(recipe.id);
          return (
            <div
              key={recipe.id}
              className="recipe-card"
              style={{
                border: `1px solid ${isActive ? "var(--accent-color, #6366f1)" : "var(--border-color, #e5e7eb)"}`,
                borderRadius: "6px",
                padding: compact ? "8px" : "12px",
                backgroundColor: isActive
                  ? "var(--accent-bg, rgba(99, 102, 241, 0.08))"
                  : "var(--bg-primary, #ffffff)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onClick={() => handleApply(recipe.id)}
            >
              <div
                className="recipe-header"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: compact ? "12px" : "13px",
                    fontWeight: 600,
                    color: "var(--text-primary, #111827)",
                  }}
                >
                  {recipe.name}
                </span>
                {isActive && (
                  <Check
                    className="w-3 h-3"
                    style={{ color: "var(--accent-color, #6366f1)" }}
                  />
                )}
              </div>

              {!compact && (
                <p
                  style={{
                    margin: "0 0 6px 0",
                    fontSize: "11px",
                    color: "var(--text-tertiary, #6b7280)",
                    lineHeight: 1.4,
                  }}
                >
                  {recipe.preview}
                </p>
              )}

              {!compact && (
                <div
                  className="skill-tags"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "3px",
                  }}
                >
                  {skillIds.map((sid: string) => (
                    <span
                      key={sid}
                      style={{
                        fontSize: "10px",
                        padding: "1px 6px",
                        borderRadius: "3px",
                        backgroundColor: "var(--tag-bg, rgba(99, 102, 241, 0.1))",
                        color: "var(--accent-color, #6366f1)",
                      }}
                    >
                      {sid}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!compact && (
        <div
          className="panel-footer"
          style={{
            marginTop: "12px",
            paddingTop: "8px",
            borderTop: "1px solid var(--border-color, #e5e7eb)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            color: "var(--text-tertiary, #6b7280)",
          }}
        >
          <Sparkles className="w-3 h-3" />
          <span>{t("prompt.recipeFooterHint")}</span>
        </div>
      )}
    </div>
  );
}
