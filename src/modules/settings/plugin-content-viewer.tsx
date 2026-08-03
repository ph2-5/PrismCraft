import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";

/**
 * 插件文档/配置查看卡片。
 *
 * 合并原 plugin-spec-viewer.tsx（spec 文本）与 plugin-schema-viewer.tsx（JSON schema）：
 * 两者结构完全相同（同一 card + pre 布局），仅标题/描述文案与内容类型不同。
 * title/description 由调用方用 t() 解析后传入；schema 对象需调用方序列化为字符串。
 */
interface PluginContentViewerProps {
  /** 卡片标题 */
  title: string;
  /** 卡片描述 */
  description: string;
  /** 展示内容（字符串或预序列化的内容） */
  content: ReactNode;
}

export function PluginContentViewer({ title, description, content }: PluginContentViewerProps) {
  return (
    <div className="card">
      <div className="pb-3">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen size={20} />
          {title}
        </div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      <div>
        <pre className="pre-block">
          {content}
        </pre>
      </div>
    </div>
  );
}
