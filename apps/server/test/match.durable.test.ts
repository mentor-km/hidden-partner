import { fileURLToPath } from "node:url"
import { BID_FLOORS, winners } from "@hidden-partner/rules"
import { afterAll, beforeAll, expect, it } from "vitest"
import { createTestHarness } from "wrangler"

type Card = { suit: string; rank: string; copy: number }
type Result = { scoreChanges: number[] }
type View = {
  type: "view"
  status: string
  rounds: number
  hostSeat: number
  you: { seat: number }
  game?: {
    roundNumber: number
    seat: {
      phase: string
      hand: Card[]
      toAct: number | null
      result: Result | null
    }
    legal: {
      bids: { pass: boolean; amounts: number[] } | null
      calls: { suit: string; rank: string }[] | null
      plays: Card[] | null
    } | null
    leaderboard: { total: number }[] | null
    winners: number[] | null
  }
}

const harness = createTestHarness({
  root: fileURLToPath(new URL("..", import.meta.url)),
  workers: [{ configPath: "./wrangler.toml" }],
})

let origin = "http://127.0.0.1"

beforeAll(async () => {
  origin = (await harness.listen()).url.origin
}, 120_000)

afterAll(async () => {
  await harness.close()
}, 30_000)

class Seat {
  view: View | null = null
  generation = 0
  #socket: WebSocket
  #waiters: (() => void)[] = []
  #error: string | null = null

  constructor(socket: WebSocket) {
    this.#socket = socket
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data)) as unknown
      const keys = keysOf(data)
      if (keys.has("seed") || keys.has("hands") || keys.has("tricks")) {
        this.#error = "The server sent hidden information"
      } else if (data && typeof data === "object" && "type" in data && data.type === "view") {
        this.view = data as View
        this.generation += 1
      } else if (data && typeof data === "object" && "type" in data && data.type === "error" && "message" in data) {
        this.#error = String(data.message)
      }
      for (const waiter of this.#waiters) waiter()
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

  wait(ready: () => boolean): Promise<void> {
    if (ready()) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("the room did not answer")), 8_000)
      const check = () => {
        if (!ready() && !this.#error) return
        clearTimeout(timer)
        this.#waiters = this.#waiters.filter((waiter) => waiter !== check)
        if (this.#error) reject(new Error(this.#error))
        else resolve()
      }
      this.#waiters.push(check)
    })
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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function connect(code: string): Promise<Seat> {
  const socket = new WebSocket(`${origin.replace(/^http/, "ws")}/parties/room/${code}`)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the socket did not open")), 8_000)
    socket.addEventListener("open", () => {
      clearTimeout(timer)
      resolve(new Seat(socket))
    })
    socket.addEventListener("error", () => {
      clearTimeout(timer)
      reject(new Error("the socket failed"))
    })
  })
}

function moveFor(view: View): unknown {
  const legal = view.game?.legal
  if (!legal) throw new Error("no legal move")
  if (legal.bids) {
    if (legal.bids.pass) return { type: "pass" }
    const amount = legal.bids.amounts[0]
    if (amount === undefined) throw new Error("no bid")
    return { type: "place_bid", amount }
  }
  const call = legal.calls?.[0]
  if (call) return { type: "call_card", suit: call.suit, rank: call.rank }
  const card = legal.plays?.[0]
  if (!card) throw new Error("no play")
  return { type: "play_card", suit: card.suit, rank: card.rank, deckIndex: card.copy }
}

it("plays a five-player match of 3 rounds through the durable object", async () => {
  const names = ["Ava", "Ben", "Cleo", "Drew", "Eden"]
  const hostSecret = "demo-host-secret"
  const response = await harness.fetch(`${origin}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Ava",
      playerId: "player-ava",
      secretHash: await sha256Hex(hostSecret),
    }),
  })
  expect(response.status).toBe(201)
  const created = (await response.json()) as { code?: string }
  if (!created.code) throw new Error("no room code")

  const seats: Seat[] = []
  for (const name of names) {
    const seat = await connect(created.code)
    seats.push(seat)
    const secret = name === "Ava" ? hostSecret : `demo-secret-${name.toLowerCase()}`
    seat.send({ type: "join", playerId: `player-${name.toLowerCase()}`, secret, name })
    await seat.wait(() => seat.view !== null)
  }
  const host = seats[0]
  if (!host) throw new Error("missing host")
  host.send({ type: "set_rounds", rounds: 3 })
  await Promise.all(seats.map((seat) => seat.wait(() => seat.view?.rounds === 3)))
  host.send({ type: "start_match" })
  await Promise.all(seats.map((seat) => seat.wait(() => seat.view?.status === "playing")))

  const opener = seats.find((seat) => seat.view?.game?.legal?.bids)
  expect(opener?.view?.game?.legal?.bids?.amounts).toEqual([BID_FLOORS[5]])
  expect(opener?.view?.game?.seat.hand).toHaveLength(12)

  const results: Result[] = []
  for (let guard = 0; guard < 2_500; guard += 1) {
    const leader = seats.find((seat) => seat.view && seat.view.you.seat === seat.view.hostSeat)
    const view = leader?.view
    if (!leader || !view?.game) throw new Error("the host has no deal")
    if (view.game.seat.phase === "scored" && view.game.seat.result && results.length < view.game.roundNumber) {
      results.push(view.game.seat.result)
    }
    if (view.status === "finished") {
      const totals = [0, 0, 0, 0, 0]
      for (const result of results) {
        result.scoreChanges.forEach((change, index) => {
          totals[index] = (totals[index] ?? 0) + change
        })
      }
      expect(results).toHaveLength(3)
      expect(view.game.leaderboard?.map((row) => row.total)).toEqual(totals)
      expect(view.game.winners).toEqual(winners({ playerCount: 5, totals, rounds: [] }))
      break
    }
    const before = seats.map((seat) => seat.generation)
    if (view.game.seat.phase === "scored") {
      leader.send({ type: "next_round" })
    } else {
      const actor = seats.find((seat) => seat.view?.you.seat === view.game?.seat.toAct)
      if (!actor?.view) throw new Error("the player to act is missing")
      actor.send(moveFor(actor.view))
    }
    await Promise.all(seats.map((seat, index) => seat.wait(() => seat.generation > (before[index] ?? 0))))
  }
  expect(seats.find((seat) => seat.view?.status === "finished")?.view?.status).toBe("finished")
  await Promise.all(seats.map((seat) => seat.close()))
}, 120_000)
