import { parseClientMessage } from "../../server/src/messages.ts"

const SAMPLE_ID = { playerId: "player", secret: "secret" }

export function checkedName(name: string): { ok: true; name: string } | { ok: false; message: string } {
  const parsed = parseClientMessage({ type: "join", ...SAMPLE_ID, name })
  if (!parsed.ok) return parsed
  if (parsed.data.type !== "join") return { ok: false, message: "Invalid message" }
  return { ok: true, name: parsed.data.name }
}

export function nameError(name: string): string | null {
  const checked = checkedName(name)
  return checked.ok ? null : checked.message
}

export function pinError(pin: string): string | null {
  if (pin.length === 0) return null
  const parsed = parseClientMessage({ type: "join", ...SAMPLE_ID, name: "Ava", pin })
  if (parsed.ok) return null
  return "PIN must be 4 digits"
}

export function roundsError(rounds: number): string | null {
  const parsed = parseClientMessage({ type: "set_rounds", rounds })
  return parsed.ok ? null : parsed.message
}
