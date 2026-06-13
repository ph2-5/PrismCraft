import { forwardRef } from "react"

import { cn } from "@/shared/utils/utils"
import { CheckIcon } from "lucide-react"

interface CheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?(checked: boolean): void
}

const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked, defaultChecked, onCheckedChange, disabled, id, ...props }, ref) => {
    const isChecked = checked ?? defaultChecked ?? false

    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={isChecked}
        data-slot="checkbox"
        data-state={isChecked ? "checked" : "unchecked"}
        disabled={disabled}
        id={id}
        ref={ref}
        className={cn(
          "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:data-[state=checked]:bg-primary",
          className
        )}
        onClick={() => {
          if (!disabled) {
            onCheckedChange?.(!isChecked)
          }
        }}
        {...props}
      >
        {isChecked && (
          <span
            data-slot="checkbox-indicator"
            className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
          >
            <CheckIcon />
          </span>
        )}
      </button>
    )
  }
)

Checkbox.displayName = "Checkbox"

export { Checkbox }
export type { CheckboxProps }
