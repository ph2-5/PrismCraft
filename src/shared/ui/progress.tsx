import { cn } from "@/shared/utils/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

function Progress({ className, children, value, ...props }: ProgressProps) {
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator value={value} />
      </ProgressTrack>
    </div>
  )
}

interface ProgressTrackProps extends React.HTMLAttributes<HTMLDivElement> {}

function ProgressTrack({ className, ...props }: ProgressTrackProps) {
  return (
    <div
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      data-slot="progress-track"
      {...props}
    />
  )
}

interface ProgressIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

function ProgressIndicator({ className, value, ...props }: ProgressIndicatorProps) {
  return (
    <div
      data-slot="progress-indicator"
      className={cn("h-full bg-primary transition-all", className)}
      style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
      {...props}
    />
  )
}

interface ProgressLabelProps extends React.HTMLAttributes<HTMLSpanElement> {}

function ProgressLabel({ className, ...props }: ProgressLabelProps) {
  return (
    <span
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

interface ProgressValueProps extends React.HTMLAttributes<HTMLSpanElement> {}

function ProgressValue({ className, ...props }: ProgressValueProps) {
  return (
    <span
      className={cn(
        "ml-auto text-sm text-muted-foreground tabular-nums",
        className
      )}
      data-slot="progress-value"
      {...props}
    />
  )
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}
