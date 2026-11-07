import { useEffect, useState } from "react"
import { roundsError } from "./validate.ts"

const PRESETS = [3, 5, 7]

export function RoundsPicker({
  value,
  disabled = false,
  onChange,
}: {
  value: number
  disabled?: boolean
  onChange: (rounds: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const typed = Number(text)
  const error = text.trim() === "" || text === String(value) ? null : roundsError(typed)

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="text-lg font-semibold">Rounds</legend>
      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((rounds) => (
          <button
            key={rounds}
            type="button"
            aria-pressed={value === rounds}
            onClick={() => onChange(rounds)}
            className={`min-h-12 rounded-2xl text-lg font-semibold ${value === rounds ? "bg-gold text-ink" : "border border-cream/50 text-cream"}`}
          >
            {rounds}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-2 text-lg">
        <span className="font-semibold">Custom rounds</span>
        <input
          inputMode="numeric"
          value={text}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            const rounds = Number(next)
            if (next.trim() !== "" && !roundsError(rounds) && rounds !== value) onChange(rounds)
          }}
          className="min-h-12 rounded-2xl border border-cream/40 bg-felt-deep px-4 text-lg text-cream"
        />
      </label>
      {error ? (
        <p role="alert" className="text-base">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
