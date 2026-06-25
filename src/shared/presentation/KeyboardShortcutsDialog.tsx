import { Keyboard } from "lucide-react";
import { t } from "@/shared/constants/messages";
import { Modal } from "./Modal";

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
}

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: Shortcut[];
}

function ShortcutKeyBadge({ shortcut }: { shortcut: Shortcut }) {
  const keys = [];
  if (shortcut.ctrl) keys.push(<kbd key="ctrl" className="px-2 py-1 text-xs rounded" style={{ background: "var(--muted)" }}>Ctrl</kbd>);
  if (shortcut.meta) keys.push(<kbd key="cmd" className="px-2 py-1 text-xs rounded" style={{ background: "var(--muted)" }}>⌘</kbd>);
  if (shortcut.alt) keys.push(<kbd key="alt" className="px-2 py-1 text-xs rounded" style={{ background: "var(--muted)" }}>Alt</kbd>);
  if (shortcut.shift) keys.push(<kbd key="shift" className="px-2 py-1 text-xs rounded" style={{ background: "var(--muted)" }}>⇧</kbd>);
  
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  keys.push(<kbd key="key" className="px-2 py-1 text-xs rounded" style={{ background: "var(--muted)" }}>{key}</kbd>);

  return <div className="flex gap-1">{keys.map((k, i) => [i > 0 && <span key={`sep-${i}`} style={{ color: "var(--muted-fg)" }}>+</span>, k])}</div>;
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
}: KeyboardShortcutsDialogProps) {
  const categorizedShortcuts = shortcuts.reduce((acc, shortcut) => {
    let category = "General";
    if (shortcut.description.toLowerCase().includes("save")) category = "File Operations";
    else if (shortcut.description.toLowerCase().includes("project") || shortcut.description.toLowerCase().includes("story")) category = "Project Management";
    else if (shortcut.description.toLowerCase().includes("generate") || shortcut.description.toLowerCase().includes("video")) category = "Video Generation";
    else if (shortcut.description.toLowerCase().includes("version")) category = "Version History";

    if (!acc[category]) acc[category] = [];
    acc[category]!.push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      ariaLabel={t("ui.keyboardShortcuts")}
      style={{ maxWidth: 672, maxHeight: "80vh", overflowY: "auto" }}
    >
      <div style={{ marginBottom: 12 }}>
          <div className="flex items-center gap-2" style={{ fontSize: 16, fontWeight: 600 }}>
            <Keyboard className="w-5 h-5" />
            {t("ui.keyboardShortcuts")}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
            {t("ui.shortcutDesc")}
          </div>
        </div>

        <div className="space-y-6">
          {Object.entries(categorizedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category}>
              <h3 className="font-semibold text-sm text-gray-300 mb-3">{category}</h3>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="flex items-center justify-between py-2 px-3 bg-gray-800/50 rounded">
                    <span className="text-sm">{shortcut.description}</span>
                    <ShortcutKeyBadge shortcut={shortcut} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs text-center" style={{ color: "var(--muted-fg)" }}>
            {t("ui.pressEscToClose")}
          </p>
        </div>
    </Modal>
  );
}

export function KeyboardShortcutsTrigger({
  onOpen,
}: {
  onOpen: () => void;
}) {
  return (
    <button type="button" aria-label={t("aria.shortcutHelp")} className="btn btn-ghost btn-sm h-8 gap-1" onClick={onOpen}>
      <Keyboard className="w-4 h-4" />
      <span className="hidden md:inline text-xs">{t("ui.shortcuts")}</span>
    </button>
  );
}
