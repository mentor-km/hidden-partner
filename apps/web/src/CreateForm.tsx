import { useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router"
import { createRoom } from "./api.ts"
import { loadIdentity, loadLastName, rememberName, rememberRoom, rememberRounds, stageJoin } from "./identity.ts"
import { RoundsPicker } from "./RoundsPicker.tsx"
import { checkedName, pinError } from "./validate.ts"
import { secretHash } from "./useRoom.ts"
import { Button, Field, Screen, controlClass } from "./ui.tsx"

export function CreateForm({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState(loadLastName)
  const [pin, setPin] = useState("")
  const [rounds, setRounds] = useState(5)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const named = checkedName(name)
    const message = (named.ok ? null : named.message) ?? pinError(pin)
    if (message || !named.ok) {
      setError(message ?? "Name must be 1 to 20 characters")
      return
    }
    setPending(true)
    setError(null)
    const { playerId } = loadIdentity()
    const created = await createRoom({ name: named.name, playerId, secretHash: await secretHash() })
    if (!created.ok) {
      setPending(false)
      setError(created.message)
      return
    }
    rememberName(named.name)
    rememberRoom(created.code, named.name)
    rememberRounds(created.code, rounds)
    stageJoin(created.code, { name: named.name, pin })
    navigate(`/r/${created.code}`)
  }

  return (
    <Screen>
      <header className="flex flex-col gap-2">
        <button type="button" className="w-fit text-lg underline" onClick={onBack}>
          Back
        </button>
        <h1 className="font-display text-4xl">Create a room</h1>
      </header>
      <form className="flex max-w-md flex-col gap-5" onSubmit={submit}>
        {error ? (
          <p role="alert" className="rounded-2xl bg-black/30 px-4 py-3 text-lg">
            {error}
          </p>
        ) : null}
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
        <RoundsPicker value={rounds} onChange={setRounds} />
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create room"}
        </Button>
      </form>
    </Screen>
  )
}
