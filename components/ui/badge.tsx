import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Trust/status pill from design-tokens.md. Semantic variants map to real product
 * needs: `verified` (green), `local` (terracotta "Locally Owned"), `info` (verified
 * by team), and `stale` — the amber "verified {date}" chip (PRD §8 / D15). Text
 * colors are the contrast-checked semantic tokens.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-[11.5px] font-sans font-semibold leading-none",
  {
    variants: {
      variant: {
        verified: "border-transparent bg-success-bg text-success",
        local: "border-transparent bg-warning-bg text-terracotta-deep",
        info: "border-transparent bg-info-bg text-info",
        stale: "border-[#efd9a0] bg-warning-bg text-terracotta-deep",
        neutral: "border-hairline bg-neutral text-secondary",
        error: "border-transparent bg-error-bg text-error",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
