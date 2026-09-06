import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90 shadow-sm",
        outline: "border bg-transparent hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
      },
      /*
        44px minimum, on every size.

        WCAG 2.5.5 (and 2.5.8 at AA) puts the floor at 44x44 CSS pixels. Every
        token here was under it: default 40, sm 32, icon 40. Only `lg` passed.
        149 <Button> renders inherit these, 71 of them size="sm" — so this one
        line is the highest-leverage accessibility change in the codebase.

        `sm` is the interesting one. It appears in 71 places, most of them
        toolbars and table rows sized around a 32px control, so simply setting
        it to h-11 would reflow all of them — and `min-h-11` does exactly that,
        because min-height beats height. It does not "pad out" a short box.

        So `sm` keeps its 32px PAINTED height and gains the remaining 12px as an
        invisible ::after overlay, centred on the button. A pseudo-element is
        part of its originating element for hit-testing, so the click target
        grows while layout does not move. That is precisely what 2.5.5 asks
        about: the area a finger or an imprecise pointer can hit, not the area
        that is drawn.

        Motor impairment and tremor are the named beneficiaries. In practice the
        people this helps most are ordinary users on phones, which is most of
        this product's audience.
      */
      size: {
        default: "h-11 px-4 py-2",
        sm: "relative h-8 px-3 text-xs after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
        lg: "h-12 px-6",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = "Button";
export { buttonVariants };
