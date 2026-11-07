import { useState } from "react"
import type { FormEvent } from "react"
import { codeError, normalizeRoomCode } from "./code.ts"
import { checkedName, pinError } from "./validate.ts"
import { Button, Field, Screen, controlClass } from "./ui.tsx"

export function JoinForm({
  initialCode,
  initialName,
  initialPin,
  error,
  onSubmit,
  onBack,
}: {
  initialCode: string
  initialName: string
  initialPin: string
  error: string | null
  onSubmit: (value: { code: string; name: string; pin: string }) => void
  onBack?: () => void
}) {
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState(initialName)
  const [pin, setPin] = useState(initialPin)
  const [localError, setLocalError] = useState<string | null>(null)
  const shown = localError ?? error

  function submit(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizeRoomCode(code)
    const named = checkedName(name)
    const message = codeError(normalized) ?? (named.ok ? null : named.message) ?? pinError(pin)
    if (message || !named.ok) {
      setLocalError(message ?? "Name must be 1 to 20 characters")
      return
    }
    setLocalError(null)
    onSubmit({ code: normalized, name: named.name, pin })
  }

  return (
    <Screen>
      <header className="flex flex-col gap-2">
        {onBack ? (
          <button type="button" className="w-fit text-lg underline" onClick={onBack}>
            Back
          </button>
        ) : null}
        <h1 className="font-display text-4xl">Join a room</h1>
      </header>
      <form className="flex max-w-md flex-col gap-5" onSubmit={submit}>
        {shown ? (
          <p role="alert" className="rounded-2xl bg-black/30 px-4 py-3 text-lg">
            {shown}
          </p>
        ) : null}
        <Field label="Room code">
          <input
            value={code}
            onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className={`${controlClass} tracking-[0.2em]`}
          />
        </Field>
        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="nickname"
            maxLength={40}
            className={controlClass}
          />
        </Field>
        <Field label="PIN" hint="Optional. 4 digits, so you can reclaim this seat on another device.">
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            className={controlClass}
          />
        </Field>
        <Button type="submit">Join</Button>
      </form>
    </Screen>
  )
}
