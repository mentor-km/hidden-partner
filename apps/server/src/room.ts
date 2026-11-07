import { Server } from "partyserver"
import type { Connection } from "partyserver"
import { randomClaimCode, randomInt } from "./codes.ts"
import { config } from "./config.ts"
import type { Env } from "./env.ts"
import { json } from "./http.ts"
import { connectionError, Lobby } from "./lobby.ts"
import type { LobbyDeps, RoomRecord } from "./lobby.ts"
import { parseCreateBody } from "./messages.ts"

type WSMessage = ArrayBuffer | ArrayBufferView | string

export class RoomServer extends Server<Env> {
  #lobby: Lobby | null = null
  #persistedEventId = 0

  async onStart(): Promise<void> {
    const stored = await this.ctx.storage.get<RoomRecord>("room")
    this.#lobby = stored ? Lobby.restore(stored, this.#dependencies()) : null
    if (!this.#lobby) return
    const live = new Set([...this.getConnections()].map((connection) => connection.id))
    this.#lobby.reconcile(live)
    await this.persist()
    await this.arm()
  }

  async onConnect(connection: Connection): Promise<void> {
    const error = connectionError(this.#lobby?.record() ?? null)
    if (!error) return
    connection.send(JSON.stringify({ type: "error", message: error }))
    connection.close(1008, error)
  }

  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    if (!this.#lobby) {
      connection.send(JSON.stringify({ type: "error", message: "Room not found" }))
      return
    }
    await this.#lobby.handle(connection.id, messageText(message))
    await this.persist()
    this.flush()
    await this.arm()
  }

  async onClose(connection: Connection): Promise<void> {
    if (this.#lobby) {
      this.#lobby.close(connection.id)
      await this.persist()
      this.flush()
      await this.arm()
    }
    // PartyServer skips the reply when the runtime reports 1005/1006, which
    // leaves the browser socket in CLOSING. Finish the handshake ourselves.
    try {
      connection.close(1000, "closed")
    } catch {
      // The socket is already closed.
    }
  }

  async onAlarm(): Promise<void> {
    if (!this.#lobby) return
    this.#lobby.alarm()
    await this.persist()
    this.flush()
    await this.arm()
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === "POST" && url.pathname === "/create") return this.#create(request)
    const error = connectionError(this.#lobby?.record() ?? null)
    return json({ message: error ?? "Not found" }, error === "This room has expired" ? 410 : 404)
  }

  async #create(request: Request): Promise<Response> {
    if (this.#lobby && this.#lobby.record().status !== "expired") {
      return json({ message: "Room already exists" }, 409)
    }
    if (this.#lobby?.record().status === "expired") return json({ message: "This room has expired" }, 409)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ message: "Invalid message" }, 400)
    }
    const parsed = parseCreateBody(body)
    if (!parsed.ok) return json({ message: parsed.message }, 400)
    this.#lobby = Lobby.create(
      {
        code: this.name,
        name: parsed.data.name,
        playerId: parsed.data.playerId,
        secretHash: parsed.data.secretHash,
      },
      this.#dependencies(),
    )
    await this.persist()
    await this.arm()
    return json({ code: this.name }, 201)
  }

  async persist(): Promise<void> {
    if (!this.#lobby) return
    await this.ctx.storage.put("room", this.#lobby.record())
    for (const event of this.#lobby.events()) {
      if (event.id <= this.#persistedEventId) continue
      await this.ctx.storage.put(`event:${String(event.id).padStart(8, "0")}`, event)
      this.#persistedEventId = event.id
    }
  }

  flush(): void {
    if (!this.#lobby) return
    for (const entry of this.#lobby.takePending()) {
      this.getConnection(entry.connectionId)?.send(JSON.stringify(entry.message))
    }
  }

  async arm(): Promise<void> {
    if (!this.#lobby) return
    const at = this.#lobby.nextAlarmAt()
    if (at == null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(at)
  }

  #dependencies(): LobbyDeps {
    return {
      now: () => Date.now(),
      randomInt,
      randomCode: () => randomClaimCode(config.claimCodeLength),
      config,
    }
  }
}

function messageText(message: WSMessage): string {
  if (typeof message === "string") return message
  const bytes =
    message instanceof ArrayBuffer
      ? new Uint8Array(message)
      : new Uint8Array(message.buffer, message.byteOffset, message.byteLength)
  return new TextDecoder().decode(bytes)
}
