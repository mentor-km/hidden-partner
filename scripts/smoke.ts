const NAMES = ["Ava", "Ben", "Cleo", "Drew", "Eden"]

type Card = { suit: string; rank: string; copy?: number }
type Legal = {
  bids: { pass: boolean; amounts: number[] } | null
  calls: Card[] | null
  plays: Card[] | null
}
type RoomView = {
  type: "view"
  status: string
  rounds: number
  hostSeat: number
  you: { seat: number; name: string }
  game?: {
    seat: { phase: string; toAct: number | null }
    legal: Legal | null
  }
}

class Player {
  latest: RoomView | null = null
  generation = 0
  #socket: WebSocket
  #waiters: (() => void)[] = []
  #error: string | null = null

  constructor(socket: WebSocket) {
    this.#socket = socket
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data)) as unknown
      assertHidden(data)
      if (!data || typeof data !== "object" || !("type" in data)) return
      if (data.type === "view") {
        this.latest = data as RoomView
        this.generation += 1
      } else if (data.type === "error" && "message" in data && typeof data.message === "string") {
        this.#error = data.message
      }
      for (const waiter of this.#waiters) waiter()
    })
  }

  send(message: unknown): void {
    this.#socket.send(JSON.stringify(message))
  }

  problem(): string | null {
    return this.#error
  }

  takeError(): string | null {
    const error = this.#error
    this.#error = null
    return error
  }

  close(): void {
    this.#socket.close()
  }

  waitUntil(ready: () => boolean): Promise<void> {
    if (ready()) return Promise.resolve()
    return withTimeout(
      new Promise((resolve) => {
        const check = () => {
          if (!ready()) return
          this.#waiters = this.#waiters.filter((waiter) => waiter !== check)
          resolve()
        }
        this.#waiters.push(check)
      }),
      20_000,
      "The room did not answer",
    )
  }
}

function assertHidden(value: unknown): void {
  const keys = keysOf(value)
  if (keys.has("seed") || keys.has("hands") || keys.has("tricks") || keys.has("secret") || keys.has("secretHash")) {
    throw new Error("The server sent hidden information")
  }
}

function keysOf(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, keys)
    return keys
  }
  if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      keys.add(key)
      keysOf(inner, keys)
    }
  }
  return keys
}

function choose(view: RoomView): unknown {
  const legal = view.game?.legal
  if (!legal) throw new Error("There is no legal move")
  if (legal.bids) {
    if (legal.bids.pass) return { type: "pass" }
    const amount = legal.bids.amounts[0]
    if (amount === undefined) throw new Error("The auction offered no bid")
    return { type: "place_bid", amount }
  }
  const call = legal.calls?.[0]
  if (call) return { type: "call_card", suit: call.suit, rank: call.rank }
  const card = legal.plays?.[0]
  if (card) return { type: "play_card", suit: card.suit, rank: card.rank, deckIndex: card.copy }
  throw new Error("The legal list was empty")
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function main(): Promise<void> {
  const origin = process.argv.find((arg) => /^https?:\/\//.test(arg))?.replace(/\/$/, "")
  if (!origin) {
    throw new Error("Usage: pnpm smoke -- https://hidden-partner.<account>.workers.dev")
  }
  await checkPage(origin)
  await playRound(origin)
  console.log("PASS")
}

async function checkPage(origin: string): Promise<void> {
  const home = await fetch(`${origin}/`)
  const invite = await fetch(`${origin}/r/ABCDEF`)
  if (!home.ok || !invite.ok) throw new Error("The site did not serve the table")
  const html = await home.text()
  const inviteHtml = await invite.text()
  if (!html.includes('id="root"') || !inviteHtml.includes('id="root"')) {
    throw new Error("Refreshing a room link did not serve the app")
  }
  if (home.headers.get("x-content-type-options") !== "nosniff") {
    throw new Error("The home page is missing security headers")
  }
  if (!home.headers.get("cache-control")?.includes("no-cache")) {
    throw new Error("The home page is cacheable")
  }
  const script = html.match(/\/assets\/[^"]+\.js/)?.[0]
  if (!script) throw new Error("The built page has no script")
  const asset = await fetch(`${origin}${script}`)
  const cache = asset.headers.get("cache-control") ?? ""
  if (!asset.ok || !cache.includes("immutable")) throw new Error("Hashed assets are not cached for a long time")
}

async function playRound(origin: string): Promise<void> {
  console.log("Playing one round with five players")
  const people = NAMES.map((name) => ({
    name,
    playerId: crypto.randomUUID(),
    secret: crypto.randomUUID(),
  }))
  const host = people[0]
  if (!host) throw new Error("The table is empty")
  const response = await fetch(`${origin}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: host.name,
      playerId: host.playerId,
      secretHash: await sha256Hex(host.secret),
    }),
  })
  if (!response.ok) throw new Error(`Could not create a room (${response.status})`)
  const created = (await response.json()) as { code?: string }
  if (!created.code) throw new Error("Create did not return a room code")

  const players: Player[] = []
  for (const person of people) {
    const player = await connect(origin, created.code)
    players.push(player)
    player.send({ type: "join", playerId: person.playerId, secret: person.secret, name: person.name })
    await player.waitUntil(() => player.latest !== null || player.problem() !== null)
    const error = player.takeError()
    if (error || !player.latest) throw new Error(error ?? "A player did not join")
  }

  const leader = players[0]
  if (!leader) throw new Error("The host did not connect")
  leader.send({ type: "set_rounds", rounds: 1 })
  await Promise.all(players.map((player) => player.waitUntil(() => player.latest?.rounds === 1)))
  leader.send({ type: "start_match" })
  await Promise.all(players.map((player) => player.waitUntil(() => player.latest?.status === "playing")))

  for (let guard = 0; guard < 400; guard += 1) {
    const view = leader.latest
    if (!view?.game) throw new Error("The host has no view of the deal")
    if (view.status === "finished") {
      for (const player of players) player.close()
      return
    }
    const actor = players.find((player) => player.latest?.you.seat === view.game?.seat.toAct)
    if (!actor?.latest) throw new Error("The player to act is missing")
    const before = players.map((player) => player.generation)
    actor.send(choose(actor.latest))
    await Promise.all(
      players.map((player, index) =>
        player.waitUntil(() => player.generation > (before[index] ?? -1) || player.problem() !== null),
      ),
    )
    for (const player of players) {
      const error = player.takeError()
      if (error) throw new Error(error)
    }
  }
  throw new Error("The round did not finish")
}

function connect(origin: string, code: string): Promise<Player> {
  const socket = new WebSocket(`${origin.replace(/^http/, "ws")}/parties/room/${code}`)
  return withTimeout(
    new Promise((resolve, reject) => {
      socket.addEventListener("open", () => resolve(new Player(socket)))
      socket.addEventListener("error", () => reject(new Error("Could not open the room socket")))
    }),
    20_000,
    "Connecting to the room",
  )
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
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "The smoke test failed")
  console.log("FAIL")
  process.exit(1)
}
