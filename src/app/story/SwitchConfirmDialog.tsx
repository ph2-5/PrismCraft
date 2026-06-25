import { Save } from "lucide-react";
import { t } from "@/shared/constants";
import { Modal } from "@/shared/presentation/Modal";
import { type useStory } from "./StoryProvider";

type StoryValue = ReturnType<typeof useStory>;

interface SwitchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingSwitchStory: StoryValue["stories"][number] | null;
  onSaveAndSwitch: () => void;
  onSwitchWithoutSave: () => void;
}

export function SwitchConfirmDialog({
  open,
  onOpenChange,
  pendingSwitchStory: _pendingSwitchStory,
  onSaveAndSwitch,
  onSwitchWithoutSave,
}: SwitchConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      ariaLabel={t("story.switchProject")}
    >
      <div>
        <div className="flex items-center gap-2">
          <Save className="w-5 h-5" />
          {t("story.switchProject")}
        </div>
        <div>
          {t("beat.unsavedSwitchMessage")}
        </div>
      </div>
      <div className="space-y-3 py-4">
        <button
          type="button"
          className="btn btn-primary w-full justify-start text-left"
          onClick={onSaveAndSwitch}
        >
          <Save className="w-4 h-4 mr-2" />
          {t("beat.saveAndSwitch")}
        </button>
        <button
          type="button"
          className="btn btn-outline w-full justify-start text-left"
          onClick={onSwitchWithoutSave}
        >
          {t("beat.switchWithoutSave")}
        </button>
        <button
          type="button"
          className="btn btn-ghost w-full justify-start text-left text-muted-foreground"
          onClick={() => onOpenChange(false)}
        >
          {t("common.cancel")}
        </button>
      </div>
    </Modal>
  );
}
