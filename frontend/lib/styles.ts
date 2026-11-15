// Class-name helpers with no "use client" directive, so server components
// (such as the landing page) can call them as well as client components.

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-400 disabled:hover:bg-brand-500",
  secondary: "bg-ink-700 text-white hover:bg-ink-600 border border-ink-600",
  ghost: "text-zinc-300 hover:text-white hover:bg-ink-800",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

/** Class string so links (next/link) can look exactly like buttons. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string): string {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}
