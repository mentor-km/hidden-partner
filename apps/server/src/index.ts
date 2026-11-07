import { getServerByName, routePartykitRequest } from "partyserver"
import { allocateCode, randomRoomCode } from "./codes.ts"
import { config } from "./config.ts"
import type { Env } from "./env.ts"
import { byteLength, json } from "./http.ts"
import { parseCreateBody } from "./messages.ts"
import { RoomServer } from "./room.ts"

export { RoomServer }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/api/rooms") {
      if (request.method !== "POST") return json({ message: "Not found" }, 404)
      return createRoom(request, env)
    }
    return (await routePartykitRequest(request, env)) ?? json({ message: "Not found" }, 404)
  },
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const raw = await request.text()
  if (byteLength(raw) > config.maxMessageBytes) return json({ message: "Message too large" }, 400)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ message: "Invalid message" }, 400)
  }
  const parsed = parseCreateBody(body)
  if (!parsed.ok) return json({ message: parsed.message }, 400)
  const payload = JSON.stringify(parsed.data)

  try {
    const code = await allocateCode(async (candidate) => {
      const room = await getServerByName(env.Room, candidate)
      const response = await room.fetch(
        new Request("https://room.internal/create", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-partykit-room": candidate,
          },
          body: payload,
        }),
      )
      if (response.status === 409) return false
      if (!response.ok) throw new Error("Could not create a room")
      return true
    }, randomRoomCode)
    return json({ code }, 201)
  } catch (error) {
    console.error("create room failed", error instanceof Error ? error.message : "unknown error")
    return json({ message: "Could not create a room" }, 500)
  }
}
