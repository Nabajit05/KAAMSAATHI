"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "dark" | "secondary" | "ghost" | "danger" | "light";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-strong disabled:bg-control",
  dark: "bg-deep text-white hover:bg-ink disabled:bg-control",
  secondary: "bg-surface text-ink border border-control hover:bg-sunken disabled:text-faint",
  ghost: "bg-transparent text-primary hover:bg-primary-soft disabled:text-faint",
  danger: "bg-surface text-error border border-error hover:bg-error-soft",
  light: "bg-white text-deep hover:bg-primary-soft",
};

export function buttonClass(variant: Variant = "primary", size: "md" | "lg" | "sm" = "md", block = false) {
  const sizes = {
    sm: "min-h-11 px-4 text-[0.95rem]",
    md: "min-h-12 px-5 text-base",
    lg: "min-h-14 px-6 text-[1.05rem]",
  };
  return [
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors",
    "disabled:cursor-not-allowed",
    VARIANT[variant],
    sizes[size],
    block ? "w-full" : "",
  ].join(" ");
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: "sm" | "md" | "lg";
    block?: boolean;
    icon?: IconName;
    busy?: boolean;
  }
>(function Button({ variant = "primary", size = "md", block, icon, busy, className = "", children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`${buttonClass(variant, size, block)} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : icon ? <Icon name={icon} size={20} /> : null}
      {children}
    </button>
  );
});

export function LinkButton({
  variant = "primary",
  size = "md",
  block,
  icon,
  className = "",
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" | "lg"; block?: boolean; icon?: IconName }) {
  return (
    <Link className={`${buttonClass(variant, size, block)} ${className}`} {...rest}>
      {icon ? <Icon name={icon} size={20} /> : null}
      {children}
    </Link>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
      />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export function Card({
  children,
  className = "",
  as: As = "section",
  ...rest
}: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li" } & Record<string, unknown>) {
  return (
    <As className={`rounded-[var(--radius-card)] ${/(^|\s)bg-/.test(className) ? "" : "bg-surface"} p-5 shadow-[var(--shadow-card)] ${className}`} {...rest}>
      {children}
    </As>
  );
}

/** Round icon button like the "↗" on cards in the reference design. */
export function RoundLink({ href, label, icon = "arrowUpRight" }: { href: string; label: string; icon?: IconName }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink hover:bg-sunken"
    >
      <Icon name={icon} />
    </Link>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon,
  className = "",
}: {
  tone?: "info" | "attention" | "error" | "success" | "demo";
  title?: ReactNode;
  children?: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  const tones = {
    info: "bg-sunken text-ink",
    attention: "bg-attention text-attention-ink border border-attention-line",
    error: "bg-error-soft text-error border border-error",
    success: "bg-success-soft text-success-ink",
    demo: "bg-attention text-attention-ink",
  };
  const defaultIcon: Record<string, IconName> = { info: "info", attention: "alert", error: "alert", success: "check", demo: "info" };
  return (
    <div className={`flex gap-3 rounded-2xl p-4 ${tones[tone]} ${className}`}>
      <Icon name={icon ?? defaultIcon[tone]} className="mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-[0.95rem]">{children}</div> : null}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "primary" | "attention" | "success" | "error" }) {
  const tones = {
    neutral: "bg-sunken text-muted",
    primary: "bg-primary-soft text-primary-strong",
    attention: "bg-attention text-attention-ink",
    success: "bg-success-soft text-success-ink",
    error: "bg-error-soft text-error",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${tones[tone]}`}>{children}</span>;
}

/** Segmented stage bar from the reference design, used for real stages only (never fake percentages). */
export function StageBar({ stages, current, label }: { stages: string[]; current: number; label: string }) {
  return (
    <div>
      <p className="sr-only">{label}</p>
      <ol className="flex gap-1" aria-label={label}>
        {stages.map((s, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={s} className="flex-1" aria-current={state === "current" ? "step" : undefined}>
              <span
                aria-hidden
                className={`block h-3 rounded-full ${
                  state === "done" ? "bg-primary" : state === "current" ? "bg-mint" : "hatch bg-surface"
                }`}
              />
              <span className={`mt-1 block text-xs ${state === "todo" ? "text-faint" : "text-ink"}`}>
                {s}
                <span className="sr-only">{state === "done" ? " ✓" : state === "current" ? " (current)" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
