import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Keyboard } from "lucide-react";
import { t } from "@/shared/constants/messages";

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
  if (shortcut.ctrl) keys.push(<kbd key="ctrl" className="px-2 py-1 text-xs bg-gray-700 rounded">Ctrl</kbd>);
  if (shortcut.meta) keys.push(<kbd key="cmd" className="px-2 py-1 text-xs bg-gray-700 rounded">⌘</kbd>);
  if (shortcut.alt) keys.push(<kbd key="alt" className="px-2 py-1 text-xs bg-gray-700 rounded">Alt</kbd>);
  if (shortcut.shift) keys.push(<kbd key="shift" className="px-2 py-1 text-xs bg-gray-700 rounded">⇧</kbd>);
  
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  keys.push(<kbd key="key" className="px-2 py-1 text-xs bg-gray-700 rounded">{key}</kbd>);

  return <div className="flex gap-1">{keys.map((k, i) => [i > 0 && <span key={`sep-${i}`} className="text-gray-400">+</span>, k])}</div>;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            {t("ui.keyboardShortcuts")}
          </DialogTitle>
          <DialogDescription>
            {t("ui.shortcutDesc")}
          </DialogDescription>
        </DialogHeader>

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

        <div className="mt-6 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 text-center">
            {t("ui.pressEscToClose")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function KeyboardShortcutsTrigger({
  onOpen,
}: {
  onOpen: () => void;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onOpen} className="h-8 gap-1">
      <Keyboard className="w-4 h-4" />
      <span className="hidden md:inline text-xs">{t("ui.shortcuts")}</span>
    </Button>
  );
}
