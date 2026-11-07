import { useEffect, useRef, useState } from "react"
import type { ClientMessage } from "../../server/src/messages.ts"
import { parseClientMessage } from "../../server/src/messages.ts"
import { sha256Hex } from "../../server/src/hash.ts"
import {
  clearStagedJoin,
  desiredRounds,
  forgetRoom,
  forgetRounds,
  loadIdentity,
  rememberRoom,
} from "./identity.ts"
import {
  isErrorMessage,
  isRoomUnavailable,
  isRoomView,
  sessionAfterClose,
  sessionAfterError,
  sessionAfterView,
  shouldRetry,
} from "./session.ts"
import type { Session } from "./session.ts"

export type JoinRequest = { name: string; pin: string; attempt: number }

const REMOVED = "The host removed you from the room"

export function roomSocketUrl(location: { protocol: string; host: string }, code: string): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${location.host}/parties/room/${code}`
}

export function useRoom(code: string, request: JoinRequest | null): {
  session: Session
  send: (message: ClientMessage) => void
} {
  const [session, setSession] = useState<Session>({ phase: "connecting", view: null, error: null })
  const requestRef = useRef(request)
  requestRef.current = request
  const sendRef = useRef<(message: ClientMessage) => void>(() => {})
  const roundsSent = useRef<number | null>(null)

  useEffect(() => {
    if (!code) return
    let stopped = false
    let allowRetry = true
    let attempt = 0
    let timer = 0
    let socket: WebSocket | null = null
    let current: Session = { phase: "connecting", view: null, error: null }
    roundsSent.current = null

    const apply = (next: Session) => {
      current = next
      if (!stopped) setSession(next)
    }

    const sendMessage = (message: ClientMessage) => {
      const parsed = parseClientMessage(message)
      if (!parsed.ok || !socket || socket.readyState !== WebSocket.OPEN) return
      socket.send(JSON.stringify(parsed.data))
    }

    const connect = () => {
      if (stopped || !allowRetry) return
      const ws = new WebSocket(roomSocketUrl(window.location, code))
      socket = ws
      ws.onopen = () => {
        if (stopped) return
        attempt = 0
        const join = requestRef.current
        if (current.view) apply({ phase: "open", view: current.view, error: null })
        if (!join) return
        const { playerId, secret } = loadIdentity()
        sendMessage({
          type: "join",
          playerId,
          secret,
          name: join.name,
          ...(join.pin ? { pin: join.pin } : {}),
        })
      }
      ws.onmessage = (event) => {
        if (stopped) return
        let data: unknown
        try {
          data = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (isRoomView(data)) {
          clearStagedJoin(code)
          rememberRoom(code, data.you.name)
          const wanted = desiredRounds(code)
          if (
            wanted !== undefined &&
            data.status === "lobby" &&
            data.you.seat === data.hostSeat &&
            data.rounds !== wanted &&
            roundsSent.current !== wanted
          ) {
            roundsSent.current = wanted
            sendMessage({ type: "set_rounds", rounds: wanted })
          }
          if (wanted !== undefined && data.rounds === wanted) forgetRounds(code)
          apply(sessionAfterView(data))
          return
        }
        if (!isErrorMessage(data)) return
        if (data.message === REMOVED) forgetRoom(code)
        const next = sessionAfterError(current, data.message)
        if (next.phase === "form") allowRetry = false
        apply(next)
      }
      ws.onclose = (event) => {
        if (stopped || !allowRetry) return
        if (event.reason && (isRoomUnavailable(event.reason) || event.reason === "The host removed you from the room")) {
          if (event.reason === "The host removed you from the room") forgetRoom(code)
          allowRetry = false
          apply(sessionAfterError(current, event.reason))
          return
        }
        const next = sessionAfterClose(current)
        apply(next)
        if (!shouldRetry(next)) return
        const delay = Math.min(8_000, 500 * 2 ** attempt)
        attempt += 1
        timer = window.setTimeout(connect, delay)
      }
    }

    connect()
    sendRef.current = sendMessage
    return () => {
      stopped = true
      allowRetry = false
      window.clearTimeout(timer)
      socket?.close()
    }
  }, [code, request?.attempt])

  return { session, send: (message) => sendRef.current(message) }
}

export async function secretHash(): Promise<string> {
  return sha256Hex(loadIdentity().secret)
}
