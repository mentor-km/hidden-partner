const base = process.env.LOBBY_URL ?? "http://127.0.0.1:8787"

type SeatView = { seat: number; name: string; connected: boolean }
type RoomView = {
  type: "view"
  status: "lobby" | "playing"
  rounds: number
  hostSeat: number
  you: { seat: number; name: string }
  seats: SeatView[]
}

const PLAYERS = [
  ["Ava", "player-ava"],
  ["Ben", "player-ben"],
  ["Cleo", "player-cleo"],
  ["Drew", "player-drew"],
  ["Eden", "player-eden"],
] as const

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

class Table {
  #socket: WebSocket
  #queue: unknown[] = []
  #waiter: ((value: unknown) => void) | null = null

  constructor(socket: WebSocket) {
    this.#socket = socket
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data)) as unknown
      const waiter = this.#waiter
      if (waiter) {
        this.#waiter = null
        waiter(data)
      } else {
        this.#queue.push(data)
      }
    })
  }

  send(message: unknown): void {
    this.#socket.send(JSON.stringify(message))
  }

  close(): Promise<void> {
    const socket = this.#socket
    if (socket.readyState === WebSocket.CLOSED) return Promise.resolve()
    return new Promise((resolve) => {
      socket.addEventListener("close", () => resolve(), { once: true })
      socket.close()
    })
  }

  async nextView(): Promise<RoomView> {
    this.#queue.length = 0
    const data = await withTimeout(this.#next(), 5_000, "Waiting for the lobby")
    if (!data || typeof data !== "object" || !("type" in data)) throw new Error("Unexpected message from the room")
    if (data.type === "error" && "message" in data) throw new Error(String(data.message))
    if (data.type !== "view") throw new Error("Unexpected message from the room")
    return data as RoomView
  }

  #next(): Promise<unknown> {
    const queued = this.#queue.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    return new Promise((resolve) => {
      this.#waiter = resolve
    })
  }
}

function printLobby(step: string, view: RoomView): void {
  console.log(`\n${step}`)
  console.log(`status: ${view.status}  rounds: ${view.rounds}  host seat: ${view.hostSeat}`)
  for (const seat of view.seats) {
    console.log(`  seat ${seat.seat}  ${seat.name}  ${seat.connected ? "connected" : "offline"}`)
  }
}

async function openTable(code: string): Promise<Table> {
  const socket = new WebSocket(`${base.replace(/^http/, "ws")}/parties/room/${code}`)
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve())
      socket.addEventListener("error", () => {
        reject(new Error(`Could not connect to ${base}. Start it with: pnpm --filter @hidden-partner/server dev`))
      })
    }),
    5_000,
    "Connecting to the room",
  )
  return new Table(socket)
}

async function main(): Promise<void> {
  const secretHash = await sha256Hex("demo-host-secret")
  let response: Response
  try {
    response = await fetch(`${base}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ava", playerId: "player-ava", secretHash }),
    })
  } catch {
    throw new Error(`Could not reach ${base}. Start it with: pnpm --filter @hidden-partner/server dev`)
  }
  if (!response.ok) throw new Error(`Create failed (${response.status}): ${await response.text()}`)
  const created = (await response.json()) as { code?: string }
  if (!created.code) throw new Error("Create did not return a room code")
  console.log(`room ${created.code}`)

  const tables: Table[] = []
  const host = await openTable(created.code)
  tables.push(host)
  host.send({ type: "join", playerId: "player-ava", secret: "demo-host-secret", name: "Ava" })
  printLobby("1. Ava claims the host seat", await host.nextView())

  host.send({ type: "set_rounds", rounds: 7 })
  printLobby("2. Host sets 7 rounds", await host.nextView())

  for (let index = 1; index < PLAYERS.length; index++) {
    const player = PLAYERS[index]
    if (!player) continue
    const table = await openTable(created.code)
    tables.push(table)
    table.send({
      type: "join",
      playerId: player[1],
      secret: `demo-secret-${player[1]}`,
      name: player[0],
    })
    printLobby(`${index + 2}. ${player[0]} joins`, await table.nextView())
  }

  host.send({ type: "start_match" })
  const started = await host.nextView()
  printLobby("7. Host starts the match", started)
  if (started.status !== "playing") throw new Error("The match did not start")
  if (started.rounds !== 7) throw new Error("The round count was not locked at 7")
  if (started.seats.length !== 5) throw new Error("The table does not have 5 seats")
  if (started.seats.map((seat) => seat.seat).join() !== "0,1,2,3,4") {
    throw new Error("Seats were not assigned from 0 with no gaps")
  }

  await Promise.all(tables.map((table) => table.close()))
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(label))
      },
    )
  })
}

try {
  await main()
  process.exit(0)
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
