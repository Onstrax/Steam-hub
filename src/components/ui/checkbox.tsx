import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, description, id, ...props },
  ref,
) {
  return (
    <label
      htmlFor={id}
      className={cn("flex cursor-pointer items-start gap-2 text-sm text-slate-200", className)}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className={cn(
          "mt-0.5 size-4 shrink-0 rounded border-slate-600 bg-slate-800 text-steam",
          "focus-visible:ring-2 focus-visible:ring-steam focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          "accent-[#66c0f4]",
        )}
        {...props}
      />
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {description ? <span className="text-xs text-slate-400">{description}</span> : null}
      </span>
    </label>
  );
});
