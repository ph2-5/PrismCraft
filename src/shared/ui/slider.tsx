import { forwardRef } from "react"

import { cn } from "@/shared/utils/utils"

interface SliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  value?: number[]
  defaultValue?: number[]
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  onValueChange?(value: number | readonly number[]): void
}

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, defaultValue, min = 0, max = 100, step = 1, onValueChange, disabled, ...props }, ref) => {
    const currentValue = value?.[0] ?? defaultValue?.[0] ?? min

    return (
      <div
        className={cn("relative flex w-full touch-none select-none items-center", className)}
        data-slot="slider"
        {...props}
      >
        <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
          <div
            className="absolute h-full bg-primary"
            style={{ width: `${((currentValue - min) / (max - min)) * 100}%` }}
          />
        </div>
        <input
          type="range"
          ref={ref}
          min={min}
          max={max}
          step={step}
          value={currentValue}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          onChange={(e) => {
            onValueChange?.([Number(e.target.value)])
          }}
        />
        <div
          className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 pointer-events-none"
          style={{ marginLeft: `calc(${((currentValue - min) / (max - min)) * 100}% - 1.25rem)` }}
        />
      </div>
    )
  }
)

Slider.displayName = "Slider"

export { Slider }
export type { SliderProps }
