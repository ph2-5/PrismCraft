import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Save } from "lucide-react";
import { t } from "@/shared/constants";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5" />
            {t("story.switchProject")}
          </DialogTitle>
          <DialogDescription>
            {t("beat.unsavedSwitchMessage")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <Button
            className="w-full justify-start text-left"
            onClick={onSaveAndSwitch}
          >
            <Save className="w-4 h-4 mr-2" />
            {t("beat.saveAndSwitch")}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start text-left"
            onClick={onSwitchWithoutSave}
          >
            {t("beat.switchWithoutSave")}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-left text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
