import { cloneElement, isValidElement, useId } from "react"
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react"

export function Screen({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8">{children}</main>
}

export function Button({
  variant = "gold",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "gold" | "quiet" | "danger" }) {
  const tone =
    variant === "gold"
      ? "bg-gold text-ink"
      : variant === "danger"
        ? "bg-[#6d2424] text-cream"
        : "border border-cream/50 bg-transparent text-cream"
  return (
    <button
      {...props}
      className={`min-h-12 rounded-2xl px-4 text-lg font-semibold disabled:opacity-50 ${tone} ${className}`}
    />
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactElement
}) {
  const id = useId()
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-describedby": hint ? `${id}-hint` : undefined,
      } as { id: string; "aria-describedby"?: string })
    : children
  return (
    <div className="flex flex-col gap-2 text-lg">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-base">
          {hint}
        </p>
      ) : null}
      {control}
    </div>
  )
}

export const controlClass =
  "min-h-12 w-full rounded-2xl border border-cream/40 bg-felt-deep px-4 text-lg text-cream"
