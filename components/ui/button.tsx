import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button surface from design-tokens.md: ink primary, teal-gradient CTA, and a
 * hairline outline. `buttonVariants` is exported so links (`<a>`/`<Link>`) can wear
 * the same styling without an event handler — the public surface is JS-free, so
 * most "buttons" are really links.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-cta font-sans font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-ink-soft",
        cta: "text-white shadow-cta [background:var(--gradient-cta)] hover:brightness-110",
        outline: "border border-hairline-strong bg-surface text-ink hover:bg-neutral",
        ghost: "text-ink hover:bg-neutral",
        link: "text-teal-dark underline-offset-4 hover:text-ink hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-[13.5px]",
        lg: "h-12 px-5 text-[14px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
