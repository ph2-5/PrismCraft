import { useState, useMemo, useEffect, useRef } from "react";
import { Copy, Check, Shield } from "lucide-react";
import { promptBuilder } from "@/modules/prompt";
import { errorLogger } from "@/shared/error-logger";
import { t, COPY_RESET_DELAY_MS } from "@/shared/constants";
import type { StoryBeat, StoryElement } from "@/domain/schemas";

interface PromptPreviewProps {
  beat: StoryBeat;
  elements: StoryElement[];
  allShots: StoryBeat[];
}

export function PromptPreview({
  beat,
  elements,
  allShots,
}: PromptPreviewProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const isFeatureAnchored = beat.featureAnchoring?.enabled;

  const prompt = useMemo(() => {
    if (isFeatureAnchored && beat.featureAnchoring) {
      return promptBuilder.buildFeatureAnchoredPrompt(
        beat,
        elements,
        beat.featureAnchoring,
        beat.shotInstruction,
      );
    }

    const isFirstShot = beat.sequence === 1;
    const hasReference = beat.reference && beat.reference.direction !== "none";

    if (isFirstShot) {
      return promptBuilder.buildFirstShotPrompt(beat, elements);
    }

    if (hasReference && beat.reference) {
      const targetShotId = beat.reference.targetShotId;
      const referenceShot = targetShotId
        ? allShots.find((s) => s.id === targetShotId)
        : allShots.find((s) => s.sequence === beat.sequence - 1);
      if (referenceShot) {
        return promptBuilder.buildCrossReferencePrompt(
          beat,
          elements,
          beat.reference,
          referenceShot,
        );
      }
    }

    const previousShot = allShots.find((s) => s.sequence === beat.sequence - 1);
    if (previousShot) {
      return promptBuilder.buildInheritancePrompt(beat, elements, previousShot);
    }

    return promptBuilder.buildIndependentShotPrompt(beat, elements);
  }, [beat, elements, allShots, isFeatureAnchored]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), COPY_RESET_DELAY_MS);
    } catch (e) {
      errorLogger.warn("[PromptPreview] Clipboard write failed, falling back to execCommand", e as Error);
      const textArea = document.createElement("textarea");
      textArea.value = prompt;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopied(false), COPY_RESET_DELAY_MS);
      } catch {
        errorLogger.error(t("error.copyFailed"));
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{t("prompt.generatedPrompt")}</h4>
            {isFeatureAnchored && (
              <span className="badge badge-info bg-primary/20 text-[10px]">
                <Shield className="w-3 h-3 mr-1" />
                {t("prompt.featureAnchoring")}
              </span>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleCopy}>
            {copied ? (
              <Check className="w-4 h-4 mr-1" style={{ color: "var(--success)" }} />
            ) : (
              <Copy className="w-4 h-4 mr-1" />
            )}
            {copied ? t("common.copied") : t("common.copy")}
          </button>
        </div>
        <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg font-mono">
          {prompt}
        </pre>
      </div>
    </div>
  );
}
