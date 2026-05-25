"use client";

export function DirtyIndicator({
  isDirty,
  label = "未保存",
}: {
  isDirty: boolean;
  label?: string;
}) {
  if (!isDirty) return null;
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-500">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      {label}
    </span>
  );
}
