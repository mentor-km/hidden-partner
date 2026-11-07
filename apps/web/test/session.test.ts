import { describe, expect, it } from "vitest"
import type { RoomView } from "../../server/src/lobby.ts"
import { roomSocketUrl } from "../src/useRoom.ts"
import {
  isRoomUnavailable,
  sessionAfterClose,
  sessionAfterError,
  shouldRetry,
} from "../src/session.ts"
import type { Session } from "../src/session.ts"

const view = {
  type: "view",
  code: "K7NQ2A",
  status: "lobby",
  rounds: 5,
  hostSeat: 0,
  you: { seat: 0, name: "Ava" },
  seats: [{ seat: 0, name: "Ava", connected: true }],
} as RoomView

describe("reconnect", () => {
  it("keeps the lobby view when the socket drops", () => {
    const open: Session = { phase: "open", view, error: null }
    const next = sessionAfterClose(open)
    expect(next.phase).toBe("reconnecting")
    expect(next.view).toBe(view)
    expect(shouldRetry(next)).toBe(true)
  })

  it("stops on an unknown room, an expired room, a wrong PIN, and a full room", () => {
    const connecting: Session = { phase: "connecting", view: null, error: null }
    for (const message of ["Room not found", "This room has expired", "Wrong PIN", "Room full", "This seat is locked"]) {
      const next = sessionAfterError(connecting, message)
      expect(next.phase).toBe("form")
      expect(next.view).toBeNull()
      expect(next.error).toBe(message)
      expect(shouldRetry(next)).toBe(false)
    }
    expect(isRoomUnavailable("Room not found")).toBe(true)
    expect(isRoomUnavailable("This room has expired")).toBe(true)
  })

  it("does not retry after the host removes you, and keeps the view for a harmless error", () => {
    const open: Session = { phase: "open", view, error: null }
    const removed = sessionAfterError(open, "The host removed you from the room")
    expect(removed.phase).toBe("form")
    expect(removed.view).toBeNull()
    expect(shouldRetry(removed)).toBe(false)
    const kept = sessionAfterError(open, "Only the host can do that")
    expect(kept.phase).toBe("open")
    expect(kept.view).toBe(view)
    expect(kept.error).toBe("Only the host can do that")
  })
})

describe("room socket", () => {
  it("builds an absolute ws url, including the scheme colon", () => {
    expect(roomSocketUrl({ protocol: "http:", host: "127.0.0.1:5173" }, "ZZZZZZ")).toBe(
      "ws://127.0.0.1:5173/parties/room/ZZZZZZ",
    )
    expect(roomSocketUrl({ protocol: "https:", host: "play.example" }, "K7NQ2A")).toBe(
      "wss://play.example/parties/room/K7NQ2A",
    )
  })
})
