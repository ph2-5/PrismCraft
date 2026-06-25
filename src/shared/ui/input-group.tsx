import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/utils/utils"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn("flex w-full items-center", className)}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "flex items-center justify-center px-3 text-muted-foreground",
  {
    variants: {
      align: {
        "left": "order-first",
        "right": "order-last",
      },
    },
    defaultVariants: {
      align: "left",
    },
  }
)

function InputGroupAddon({
  className,
  align,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      className={cn(inputGroupAddonVariants({ align }), className)}
      {...props}
    />
  )
}

type InputGroupButtonVariant = "default" | "outline" | "ghost" | "destructive" | "secondary" | "link";
type InputGroupButtonSize = "default" | "sm" | "xs" | "icon" | "lg";

interface InputGroupButtonProps extends React.ComponentProps<"button"> {
  variant?: InputGroupButtonVariant;
  size?: InputGroupButtonSize;
}

function InputGroupButton({
  className,
  variant = "default",
  size,
  ...props
}: InputGroupButtonProps) {
  const variantClass =
    variant === "outline" || variant === "secondary"
      ? "btn btn-outline"
      : variant === "ghost"
        ? "btn btn-ghost"
        : variant === "destructive"
          ? "btn btn-danger"
          : "btn btn-primary";
  const sizeClass =
    size === "sm"
      ? "btn-sm"
      : size === "xs" || size === "icon"
        ? "btn-xs"
        : "";
  return (
    <button
      type="button"
      data-slot="input-group-button"
      className={cn(variantClass, sizeClass, className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex items-center text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        "flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        "flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
