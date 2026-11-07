const base = process.env.LOBBY_URL ?? "http://127.0.0.1:8787"

type CardName = { suit: string; rank: string }
type Card = CardName & { copy: number }
type Legal = {
  bids: { pass: boolean; amounts: number[] } | null
  calls: CardName[] | null
  plays: Card[] | null
}
type GameView = {
  roundNumber: number
  seat: {
    phase: string
    passed: boolean[]
    bids: { seat: number; amount: number }[]
    toAct: number | null
    bidder: number | null
    calledCard: CardName | null
    trump: string | null
    currentTrick: unknown[]
    result: {
      bidder: number
      bid: number
      partners: number[]
      teamPoints: number
      othersPoints: number
      made: boolean
      scoreChanges: number[]
    } | null
  }
  legal: Legal | null
  leaderboard: { seat: number; name: string; total: number }[] | null
  winners: number[] | null
}
type RoomView = {
  type: "view"
  status: string
  rounds: number
  hostSeat: number
  you: { seat: number; name: string }
  seats: { seat: number; name: string; connected: boolean }[]
  game?: GameView
}
type Identity = { name: string; playerId: string; secret: string }
type Note = { type: "redeal" } | { type: "partner"; seat: number }

const SUIT_NAME: Record<string, string> = { C: "clubs", D: "diamonds", H: "hearts", S: "spades" }
const RANK_NAME: Record<string, string> = { A: "ace", K: "king", Q: "queen", J: "jack", "10": "10" }

const FIVE = ["Ava", "Ben", "Cleo", "Drew", "Eden"]
const NINE = [...FIVE, "Finn", "Gia", "Hugo", "Ivy"]

class Client {
  latest: RoomView | null = null
  generation = 0
  notes: Note[] = []
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
      } else if (data.type === "redeal") {
        this.notes.push({ type: "redeal" })
      } else if (data.type === "partner" && "seat" in data && typeof data.seat === "number") {
        this.notes.push({ type: "partner", seat: data.seat })
      } else if (data.type === "error" && "message" in data) {
        this.#error = String(data.message)
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

  close(): Promise<void> {
    const socket = this.#socket
    if (socket.readyState === WebSocket.CLOSED) return Promise.resolve()
    return new Promise((resolve) => {
      socket.addEventListener("close", () => resolve(), { once: true })
      socket.close()
    })
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
      8_000,
      "Waiting for the table",
    )
  }
}

function assertHidden(value: unknown): void {
  const keys = keysOf(value)
  if (keys.has("seed") || keys.has("hands") || keys.has("tricks")) {
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

function identity(name: string): Identity {
  return {
    name,
    playerId: `player-${name.toLowerCase()}`,
    secret: name === "Ava" ? "demo-host-secret" : `demo-secret-${name.toLowerCase()}`,
  }
}

function choose(view: RoomView): unknown {
  const legal = view.game?.legal
  if (!legal) throw new Error(`${view.you.name} has no legal move`)
  if (legal.bids) {
    if (legal.bids.pass && (legal.bids.amounts.length === 0 || Math.random() < 0.65)) return { type: "pass" }
    const amount = legal.bids.amounts[Math.floor(Math.random() * legal.bids.amounts.length)]
    if (amount === undefined) throw new Error("the engine offered no bid")
    return { type: "place_bid", amount }
  }
  if (legal.calls && legal.calls.length > 0) {
    const card = legal.calls[Math.floor(Math.random() * legal.calls.length)]
    if (!card) throw new Error("the engine offered no call")
    return { type: "call_card", suit: card.suit, rank: card.rank }
  }
  if (legal.plays && legal.plays.length > 0) {
    const card = legal.plays[Math.floor(Math.random() * legal.plays.length)]
    if (!card) throw new Error("the engine offered no play")
    return { type: "play_card", suit: card.suit, rank: card.rank, deckIndex: card.copy }
  }
  throw new Error(`${view.you.name} has an empty legal list`)
}

type Snap = {
  roundNumber: number
  bids: number
  passed: boolean[]
  called: boolean
  scored: boolean
  final: boolean
  results: number
}

function seatName(view: RoomView, seat: number): string {
  return view.seats.find((item) => item.seat === seat)?.name ?? `seat ${seat}`
}

function printProgress(view: RoomView, notes: Note[], snap: Snap): void {
  const game = view.game
  if (!game) return
  if (game.roundNumber !== snap.roundNumber) {
    console.log(`\nRound ${game.roundNumber}`)
    snap.roundNumber = game.roundNumber
    snap.bids = 0
    snap.passed = []
    snap.called = false
    snap.scored = false
  }
  const redealt = notes.some((note) => note.type === "redeal")
  for (const note of notes) {
    if (note.type === "redeal") console.log("Redeal. The same dealer shuffles again.")
    else console.log(`Partner revealed: ${seatName(view, note.seat)}`)
  }
  notes.length = 0
  if (redealt) {
    snap.bids = 0
    snap.passed = []
    snap.called = false
  }
  const bids = game.seat.bids
  for (const bid of bids.slice(snap.bids)) console.log(`${seatName(view, bid.seat)} bids ${bid.amount}`)
  snap.bids = bids.length
  game.seat.passed.forEach((passed, seat) => {
    if (passed && !snap.passed[seat]) console.log(`${seatName(view, seat)} passes`)
  })
  snap.passed = [...game.seat.passed]
  if (game.seat.calledCard && !snap.called && game.seat.bidder !== null) {
    const card = game.seat.calledCard
    const rank = RANK_NAME[card.rank] ?? card.rank
    const suit = SUIT_NAME[card.suit] ?? card.suit
    console.log(`${seatName(view, game.seat.bidder)} calls the ${rank} of ${suit}. Trump is ${suit}.`)
    snap.called = true
  }
  if (game.seat.phase === "scored" && game.seat.result && !snap.scored) {
    const result = game.seat.result
    const partners = result.partners.map((seat) => seatName(view, seat)).join(", ")
    console.log(`\nRound ${game.roundNumber} result`)
    console.log(
      `  ${seatName(view, result.bidder)} bid ${result.bid}. Partners: ${partners}. Team ${result.teamPoints}, others ${result.othersPoints}. The bid was ${result.made ? "made" : "not made"}.`,
    )
    console.log(
      `  ${result.scoreChanges.map((change, seat) => `${seatName(view, seat)} ${change >= 0 ? "+" : ""}${change}`).join(", ")}`,
    )
    if (game.leaderboard) {
      console.log(
        `  Leaderboard: ${game.leaderboard.map((row) => `${row.name} ${row.total}`).join(", ")}`,
      )
    }
    snap.scored = true
    snap.results += 1
  }
  if (view.status === "finished" && !snap.final) {
    console.log("\nFinal leaderboard")
    for (const row of game.leaderboard ?? []) console.log(`  ${row.name}  ${row.total}`)
    const winners = (game.winners ?? []).map((seat) => seatName(view, seat))
    console.log(`Winners: ${winners.join(", ")}`)
    snap.final = true
  }
}

async function connect(code: string): Promise<Client> {
  const socket = new WebSocket(`${base.replace(/^http/, "ws")}/parties/room/${code}`)
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve())
      socket.addEventListener("error", () => {
        reject(new Error(`Could not connect to ${base}. Start it with: pnpm --filter @hidden-partner/server dev`))
      })
    }),
    8_000,
    "Connecting to the room",
  )
  return new Client(socket)
}

async function createRoom(host: Identity): Promise<string> {
  const secretHash = await sha256Hex(host.secret)
  let response: Response
  try {
    response = await fetch(`${base}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: host.name, playerId: host.playerId, secretHash }),
    })
  } catch {
    throw new Error(`Could not reach ${base}. Start it with: pnpm --filter @hidden-partner/server dev`)
  }
  if (!response.ok) throw new Error(`Create failed (${response.status}): ${await response.text()}`)
  const created = (await response.json()) as { code?: string }
  if (!created.code) throw new Error("Create did not return a room code")
  return created.code
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function generations(players: Client[]): number[] {
  return players.map((player) => player.generation)
}

async function waitBump(players: Client[], before: number[]): Promise<void> {
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

async function reconnect(players: Client[], code: string, identities: Identity[]): Promise<Client[]> {
  const host = players.find((player) => player.latest && player.latest.you.seat === player.latest.hostSeat)
  const victimIndex = players.findIndex(
    (player) => player.latest && host?.latest && player.latest.you.seat !== host.latest.hostSeat,
  )
  const victim = players[victimIndex]
  const person = identities[victimIndex]
  if (!victim || !person || !host?.latest) throw new Error("nobody to disconnect")
  console.log(`${person.name} disconnects mid-trick`)
  const beforeClose = generations(players)
  await victim.close()
  const others = players.filter((_, index) => index !== victimIndex)
  await Promise.all(
    others.map((player) => {
      const mark = beforeClose[players.indexOf(player)] ?? 0
      return player.waitUntil(() => player.generation > mark)
    }),
  )
  const next = await connect(code)
  const beforeJoin = generations(others)
  next.send({ type: "join", playerId: person.playerId, secret: person.secret, name: person.name })
  await next.waitUntil(() => next.latest !== null)
  await Promise.all(others.map((player, index) => player.waitUntil(() => player.generation > (beforeJoin[index] ?? -1))))
  console.log(`${person.name} reconnects and picks up the same hand`)
  const replaced = players.slice()
  replaced[victimIndex] = next
  return replaced
}

async function playMatch(names: string[], rounds: number, drop: boolean): Promise<void> {
  const identities = names.map((name) => identity(name))
  const hostIdentity = identities[0]
  if (!hostIdentity) throw new Error("the table is empty")
  const code = await createRoom(hostIdentity)
  console.log(`\nroom ${code}  ${names.length} players  ${rounds} round${rounds === 1 ? "" : "s"}`)
  let players: Client[] = []
  for (const person of identities) {
    const client = await connect(code)
    players.push(client)
    client.send({ type: "join", playerId: person.playerId, secret: person.secret, name: person.name })
    await client.waitUntil(() => client.latest !== null)
  }
  const host = players[0]
  if (!host) throw new Error("the host did not connect")
  host.send({ type: "set_rounds", rounds })
  await Promise.all(players.map((player) => player.waitUntil(() => player.latest?.rounds === rounds)))
  host.send({ type: "start_match" })
  await Promise.all(players.map((player) => player.waitUntil(() => player.latest?.status === "playing")))

  const snap: Snap = { roundNumber: 0, bids: 0, passed: [], called: false, scored: false, final: false, results: 0 }
  let dropped = false
  for (let guard = 0; guard < 2_500 && !snap.final; guard += 1) {
    const leader = players.find((player) => player.latest && player.latest.you.seat === player.latest.hostSeat)
    const view = leader?.latest
    if (!leader || !view?.game) throw new Error("the host has no view of the deal")
    printProgress(view, leader.notes, snap)
    if (view.status === "finished") break
    if (drop && !dropped && view.game.seat.phase === "play" && view.game.seat.currentTrick.length >= 1) {
      players = await reconnect(players, code, identities)
      dropped = true
      continue
    }
    if (view.game.seat.phase === "scored") {
      const before = generations(players)
      leader.send({ type: "next_round" })
      await waitBump(players, before)
      continue
    }
    const actor = players.find((player) => player.latest?.you.seat === view.game?.seat.toAct)
    if (!actor?.latest) throw new Error("the player to act is missing")
    const before = generations(players)
    actor.send(choose(actor.latest))
    await waitBump(players, before)
  }
  if (drop && !dropped) throw new Error("nobody disconnected mid-trick")
  if (snap.results !== rounds) throw new Error(`expected ${rounds} results, saw ${snap.results}`)
  if (!snap.final) throw new Error("the match did not finish")
  await Promise.all(players.map((player) => player.close()))
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

export {}

try {
  await playMatch(FIVE, 3, true)
  await playMatch(NINE, 1, false)
  process.exit(0)
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
