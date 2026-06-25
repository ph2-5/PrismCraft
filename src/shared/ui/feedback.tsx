import { AlertCircle, CheckCircle, Info, type LucideIcon } from "lucide-react";
import type { ApiErrorCode } from "@/domain/schemas";
import { t } from "@/shared/constants/messages";

interface ErrorDisplayProps {
  error?: string;
  code?: ApiErrorCode;
  suggestion?: string;
  onRetry?: () => void;
  className?: string;
}

const CODE_ICONS: Record<ApiErrorCode, LucideIcon | React.FC<React.SVGProps<SVGSVGElement>>> = {
  INVALID_API_KEY: KeyIcon,
  RATE_LIMITED: ClockIcon,
  ENDPOINT_NOT_FOUND: SearchIcon,
  API_SERVER_ERROR: ServerIcon,
  TIMEOUT: ClockIcon,
  CONNECTION_FAILED: WifiOffIcon,
  INVALID_RESPONSE: FileWarningIcon,
  POLLINATIONS_FAILED: ImageOffIcon,
  INTERNAL_ERROR: AlertCircle,
  UNKNOWN_ERROR: AlertCircle,
};

function KeyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  );
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ServerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  );
}

function WifiOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
      <path d="M5 13a10 10 0 0 1 5.24-2.76" />
      <line x1="12" x2="12.01" y1="20" y2="20" />
    </svg>
  );
}

function FileWarningIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" x2="12" y1="13" y2="17" />
      <line x1="12" x2="12.01" y1="21" y2="21" />
    </svg>
  );
}

function ImageOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
      <line x1="13.5" x2="6" y1="13.5" y2="21" />
      <line x1="18" x2="21" y1="12" y2="15" />
      <path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59" />
      <path d="M21 15V5a2 2 0 0 0-2-2H9" />
    </svg>
  );
}

const CODE_COLORS: Record<ApiErrorCode, { bg: string; border: string; text: string }> = {
  INVALID_API_KEY: { bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive" },
  RATE_LIMITED: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning" },
  ENDPOINT_NOT_FOUND: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning" },
  API_SERVER_ERROR: { bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive" },
  TIMEOUT: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning" },
  CONNECTION_FAILED: { bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive" },
  INVALID_RESPONSE: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning" },
  POLLINATIONS_FAILED: { bg: "bg-primary/10", border: "border-primary/30", text: "text-primary" },
  INTERNAL_ERROR: { bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive" },
  UNKNOWN_ERROR: { bg: "bg-muted", border: "border-border", text: "text-muted-foreground" },
};

export function ErrorDisplay({
  error,
  code = "UNKNOWN_ERROR",
  suggestion,
  onRetry,
  className = "",
}: ErrorDisplayProps) {
  if (!error) return null;

  const Icon = CODE_ICONS[code] || AlertCircle;
  const colors = CODE_COLORS[code] || CODE_COLORS.UNKNOWN_ERROR;

  return (
    <div className={`rounded-lg border p-4 ${colors.bg} ${colors.border} ${className}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 ${colors.text}`} />
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium ${colors.text}`}>{error}</h4>
          {suggestion && (
            <p className={`mt-1 text-sm ${colors.text} opacity-80`}>{suggestion}</p>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className={`mt-3 text-sm font-medium underline hover:opacity-80 ${colors.text}`}
            >
              {t("common.retry")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface LoadingStateProps {
  message?: string;
  subMessage?: string;
  className?: string;
}

export function LoadingState({
  message = t("feedback.processing"),
  subMessage,
  className = "",
}: LoadingStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-4 border-border border-t-primary animate-spin" />
      </div>
      <p className="mt-4 text-muted-foreground font-medium">{message}</p>
      {subMessage && <p className="mt-1 text-sm text-muted-foreground">{subMessage}</p>}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
      {icon || <Info className="h-12 w-12 text-gray-300" />}
      <h3 className="mt-4 text-lg font-medium text-foreground">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

interface SuccessStateProps {
  message: string;
  className?: string;
}

export function SuccessState({ message, className = "" }: SuccessStateProps) {
  return (
    <div className={`flex items-center gap-2 text-success ${className}`}>
      <CheckCircle className="h-5 w-5" />
      <span>{message}</span>
    </div>
  );
}
