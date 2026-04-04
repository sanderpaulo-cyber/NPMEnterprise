import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "border border-primary/20 bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/25",
        destructive:
          "border border-destructive/20 bg-destructive text-destructive-foreground shadow-md shadow-destructive/15 hover:shadow-lg hover:shadow-destructive/20",
        outline:
          "border border-border/80 bg-background/50 shadow-sm hover:bg-accent/60 hover:text-accent-foreground",
        secondary:
          "border border-border/70 bg-secondary/90 text-secondary-foreground shadow-sm hover:bg-secondary hover:shadow-md",
        ghost: "border border-transparent shadow-none hover:bg-accent/50 hover:text-accent-foreground",
        link: "border-transparent text-primary underline-offset-4 shadow-none hover:underline",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-11 rounded-xl px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
