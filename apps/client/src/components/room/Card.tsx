import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/**
 * The one card shell the redesign uses everywhere — replaces the three
 * competing shells (bg-neutral-800 / -800/20 / -800/30) in the old dashboard.
 */
export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4",
      className
    )}
    {...props}
  />
);
