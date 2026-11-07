import { useEffect, useRef, useState } from "react"

export type ToastNote = {
  id: string
  text: string
  kind: "timed" | "stay"
  testId?: string
  actionLabel?: string
}

export function addToast(current: ToastNote[], note: ToastNote): ToastNote[] {
  if (current.some((item) => item.id === note.id)) return current
  const stay = current.filter((item) => item.kind === "stay")
  const timed = current.filter((item) => item.kind === "timed")
  const nextStay = note.kind === "stay" ? [...stay, note] : stay
  const nextTimed = note.kind === "timed" ? [...timed, note] : timed
  const room = Math.max(0, 3 - nextStay.length)
  return [...nextStay, ...nextTimed.slice(-room)]
}

export function Toasts({
  items,
  onDismiss,
  onAction,
}: {
  items: ToastNote[]
  onDismiss: (id: string) => void
  onAction?: () => void
}) {
  if (items.length === 0) return null
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 top-16 z-40 mx-auto flex w-full max-w-sm flex-col gap-2 px-2"
    >
      {items.slice(0, 3).map((item) => (
        <ToastView key={item.id} item={item} onDismiss={onDismiss} onAction={onAction} />
      ))}
    </div>
  )
}

function ToastView({
  item,
  onDismiss,
  onAction,
}: {
  item: ToastNote
  onDismiss: (id: string) => void
  onAction?: () => void
}) {
  const remaining = useRef(4_000)
  const touching = useRef(false)
  const focused = useRef(false)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (item.kind === "stay" || paused) return
    const started = Date.now()
    const timer = window.setTimeout(() => onDismiss(item.id), remaining.current)
    return () => {
      remaining.current = Math.max(0, remaining.current - (Date.now() - started))
      window.clearTimeout(timer)
    }
  }, [item.id, item.kind, onDismiss, paused])

  function sync() {
    setPaused(touching.current || focused.current)
  }

  return (
    <div
      role={item.kind === "stay" ? "status" : "status"}
      data-testid={item.testId ?? "toast"}
      tabIndex={0}
      className="pointer-events-auto rounded-2xl bg-gold px-3 py-2 text-base font-semibold text-ink shadow-lg"
      onPointerDown={() => {
        touching.current = true
        sync()
      }}
      onPointerUp={() => {
        touching.current = false
        sync()
      }}
      onPointerLeave={() => {
        touching.current = false
        sync()
      }}
      onFocus={() => {
        focused.current = true
        sync()
      }}
      onBlur={() => {
        focused.current = false
        sync()
      }}
    >
      <p>{item.text}</p>
      {item.actionLabel && onAction ? (
        <button type="button" className="mt-1 underline" onClick={onAction}>
          {item.actionLabel}
        </button>
      ) : null}
    </div>
  )
}
