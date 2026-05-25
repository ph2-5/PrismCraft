import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/shared/utils/utils"

function Input({ className, type, value, defaultValue, onChange, ...props }: React.ComponentProps<"input">) {
  const isControlled = value !== undefined || onChange !== undefined;
  const inputProps: Record<string, unknown> = {
    type,
    "data-slot": "input",
    className: cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:border-primary/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
      className
    ),
    ...props,
  };
  if (isControlled) {
    inputProps.value = value ?? "";
    if (onChange) {
      inputProps.onChange = onChange;
    }
  } else {
    inputProps.defaultValue = defaultValue ?? "";
  }
  return (
    <InputPrimitive
      {...inputProps}
    />
  )
}

export { Input }
