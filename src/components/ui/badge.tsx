import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "success" | "warning" | "info" | "muted" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-slate-700 text-slate-100",
  success: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30",
  warning: "bg-amber-500/20 text-amber-300 ring-amber-500/30",
  info: "bg-sky-500/20 text-sky-300 ring-sky-500/30",
  muted: "bg-slate-800 text-slate-400 ring-slate-600/40",
  danger: "bg-rose-500/20 text-rose-300 ring-rose-500/30",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
