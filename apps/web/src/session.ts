import type { RoomView } from "../../server/src/lobby.ts"

export type Session = {
  phase: "connecting" | "open" | "reconnecting" | "form"
  view: RoomView | null
  error: string | null
}

const STOP = new Set([
  "Room not found",
  "This room has expired",
  "Wrong PIN",
  "This seat is locked",
  "This seat has no PIN",
  "Wrong secret",
  "Room full",
  "The host removed you from the room",
  "This seat was opened somewhere else",
  "The match has already started",
  "That name and code do not match a released seat",
  "This seat was released. Use the claim code from the host.",
])

export function isRoomUnavailable(message: string | null): boolean {
  return message === "Room not found" || message === "This room has expired"
}

export function sessionAfterView(view: RoomView): Session {
  return { phase: "open", view, error: null }
}

export function sessionAfterError(session: Session, message: string): Session {
  if (!session.view || STOP.has(message)) return { phase: "form", view: null, error: message }
  return { ...session, error: message }
}

export function sessionAfterClose(session: Session): Session {
  if (session.phase === "form") return session
  if (session.view) return { phase: "reconnecting", view: session.view, error: session.error }
  return { phase: "connecting", view: null, error: session.error }
}

export function shouldRetry(session: Session): boolean {
  return session.phase === "connecting" || session.phase === "reconnecting"
}

export function isRoomView(value: unknown): value is RoomView {
  if (!value || typeof value !== "object") return false
  const view = value as Partial<RoomView>
  return (
    view.type === "view" &&
    typeof view.code === "string" &&
    typeof view.hostSeat === "number" &&
    Array.isArray(view.seats) &&
    !!view.you &&
    typeof view.you.seat === "number"
  )
}

export function isErrorMessage(value: unknown): value is { type: "error"; message: string } {
  if (!value || typeof value !== "object") return false
  const message = value as { type?: unknown; message?: unknown }
  return message.type === "error" && typeof message.message === "string"
}
