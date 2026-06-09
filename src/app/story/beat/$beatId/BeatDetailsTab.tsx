import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { t } from "@/shared/constants";
import type { StoryBeat } from "@/domain/schemas";

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-xs font-medium mb-1 ${className}`}>{children}</div>
  );
}

interface BeatDetailsTabProps {
  beat: StoryBeat;
  elementNames: Record<string, string>;
}

export function BeatDetailsTab({ beat, elementNames }: BeatDetailsTabProps) {
  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground">
            {t("beat.content")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">{t("beat.titleLabel")}</Label>
            <p className="text-sm text-foreground">
              {beat.title || t("story.untitled")}
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("beat.contentDesc")}</Label>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {beat.content || beat.description || t("story.noDesc")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">{t("beat.duration")}</Label>
              <p className="text-sm text-foreground">
                {t("beat.durationSeconds", { count: beat.duration ?? 0 })}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("beat.type")}</Label>
              <p className="text-sm text-foreground">
                {beat.type || t("story.notSet")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {beat.camera && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground">
              {t("beat.cameraParams")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {beat.camera.angle && (
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t("beat.angle")}</span>
                <span className="text-sm text-foreground">
                  {beat.camera.angle}
                </span>
              </div>
            )}
            {beat.camera.movement && (
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t("beat.movement")}</span>
                <span className="text-sm text-foreground">
                  {beat.camera.movement}
                </span>
              </div>
            )}
            {beat.shotType && (
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">{t("beat.shotSize")}</span>
                <span className="text-sm text-foreground">
                  {beat.shotType}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {beat.elementIds && beat.elementIds.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground">
              {t("beat.elementBinding")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {beat.elementIds.map((elementId) => {
              const binding = beat.elementBindings?.[elementId];
              const name = elementNames[elementId];
              return (
                <div
                  key={elementId}
                  className="p-2 rounded-lg bg-muted/50 border border-border"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {name || elementId}
                    </span>
                    {binding?.role && (
                      <Badge variant="outline" className="text-xs">
                        {binding.role}
                      </Badge>
                    )}
                  </div>
                  {name && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {elementId}
                    </p>
                  )}
                  {binding?.action && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("beat.action", { action: binding.action })}
                    </p>
                  )}
                  {binding?.emotion && (
                    <p className="text-xs text-muted-foreground">
                      {t("beat.emotion", { emotion: binding.emotion })}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
