import { Building2, RefreshCw } from "lucide-react";
import { t } from "@/shared/constants/messages";
import type { Scene } from "@/domain/schemas";
import type { ReferencedBeat, SetCurrentScene } from "./SceneEditorParts";

interface ScenePageHeaderProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onNewScene: () => void;
}

export function ScenePageHeader({
  searchQuery,
  setSearchQuery,
  onNewScene,
}: ScenePageHeaderProps) {
  return (
    <div className="top-tabs justify-between">
      <span className="font-semibold text-sm"><Building2 className="inline-block" size={14} /> {t("scene.title")}</span>
      <div className="toolbar">
        <input
          className="input !text-xs !py-1.5 !px-2.5 w-[180px]"
          placeholder={t("scene.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onNewScene}
        >
          + {t("scene.createNewScene")}
        </button>
      </div>
    </div>
  );
}

interface SceneDetailHeaderProps {
  scene: Scene;
  avatarImage: string | undefined;
  referencedBeats: ReferencedBeat[];
  setCurrentScene: SetCurrentScene;
  onChangeCover: () => void;
}

export function SceneDetailHeader({
  scene,
  avatarImage,
  referencedBeats,
  setCurrentScene,
  onChangeCover,
}: SceneDetailHeaderProps) {
  return (
    <div className="flex items-center gap-3.5">
      <div
        className="element-avatar scene !w-16 !h-16 !text-[28px] !rounded-[14px] bg-cover bg-center"
        style={avatarImage ? { backgroundImage: `url(${avatarImage})` } : undefined}
      >
        {!avatarImage && ""}
      </div>
      <div className="flex-1 min-w-0">
        <input
          className="input !text-base !font-bold !py-1.5 !px-2.5"
          data-testid="scene-name-input"
          value={scene.name}
          placeholder={`${t("scene.namePlaceholder")} *`}
          // 第 6 轮审计修复：aria-label 简化为只含字段名
          // required 属性会让屏幕阅读器自动宣告"必填"，无需在 aria-label 中重复
          aria-label={t("scene.name")}
          required
          onChange={(e) =>
            setCurrentScene((prev) => ({ ...prev, name: e.target.value }), true)
          }
        />
        <div className="flex gap-1.5 mt-1">
          <span className="badge badge-info">
            {scene.type || t("scene.label")}
          </span>
          <span className="badge !text-[9px]">
            {t("scene.referencedBy", { count: referencedBeats.length })}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-outline btn-xs"
        onClick={onChangeCover}
      >
        <RefreshCw className="inline-block" size={12} /> {t("scene.changeCover")}
      </button>
    </div>
  );
}
