import { parseCreateBody } from "../../server/src/messages.ts"

export async function createRoom(body: {
  name: string
  playerId: string
  secretHash: string
}): Promise<{ ok: true; code: string } | { ok: false; message: string }> {
  const parsed = parseCreateBody(body)
  if (!parsed.ok) return parsed
  let response: Response
  try {
    response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    })
  } catch {
    return { ok: false, message: "Could not reach the room server." }
  }
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const message =
    payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : "Could not create a room"
  if (!response.ok) return { ok: false, message }
  const code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string" ? payload.code : ""
  if (!code) return { ok: false, message: "Could not create a room" }
  return { ok: true, code }
}
