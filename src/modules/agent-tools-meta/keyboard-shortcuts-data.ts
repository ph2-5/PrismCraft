/**
 * 键盘快捷键数据
 *
 * 包含全局、编辑器、分镜页面的快捷键。
 * 从 help-tools-data.ts 按数据类型拆分而来。
 */

/** 键盘快捷键条目 */
export interface KeyboardShortcut {
  key: string;
  description: string;
  context: string;
}

/**
 * 键盘快捷键字典
 */
export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  // 全局
  { key: "Ctrl+N", description: "新建项目", context: "global" },
  { key: "Ctrl+S", description: "保存当前项目", context: "global" },
  { key: "Ctrl+Shift+S", description: "另存为", context: "global" },
  { key: "Ctrl+O", description: "打开项目", context: "global" },
  { key: "Ctrl+,", description: "打开设置页面", context: "global" },
  { key: "F11", description: "全屏切换", context: "global" },
  { key: "Ctrl+P", description: "打印/导出", context: "global" },
  // 编辑器
  { key: "Ctrl+B", description: "加粗选中文本", context: "editor" },
  { key: "Ctrl+I", description: "斜体选中文本", context: "editor" },
  { key: "Ctrl+D", description: "复制选中项", context: "editor" },
  { key: "Delete", description: "删除选中项", context: "editor" },
  { key: "Ctrl+A", description: "全选", context: "editor" },
  { key: "Esc", description: "取消选中/关闭对话框", context: "editor" },
  { key: "Tab", description: "缩进/切换焦点", context: "editor" },
  // 分镜页面
  { key: "Ctrl+Enter", description: "生成当前分镜", context: "shot_page" },
  { key: "Ctrl+Shift+D", description: "复制当前分镜", context: "shot_page" },
  { key: "Ctrl+Up", description: "上移当前分镜", context: "shot_page" },
  { key: "Ctrl+Down", description: "下移当前分镜", context: "shot_page" },
  { key: "Space", description: "预览分镜画面", context: "shot_page" },
  { key: "Ctrl+Click", description: "多选分镜", context: "shot_page" },
];
