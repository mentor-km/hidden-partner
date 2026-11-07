import { describe, expect, it } from "vitest"
import {
  BID_FLOORS,
  HAND_SIZE,
  apply,
  bidFloor,
  createMatch,
  nextDealer,
  recordRound,
  winners,
} from "@hidden-partner/rules"
import type { Action, Card, GameLogEntry, MatchState, Rank, RoundState, Seed, Suit } from "@hidden-partner/rules"
import { callableCards, createRound } from "@hidden-partner/rules/server"
import { config } from "../src/config.ts"
import { Lobby } from "../src/lobby.ts"
import type { LobbyDeps, RoomView } from "../src/lobby.ts"
import { freshSeed, replayCurrentRound } from "../src/play.ts"

const SECRET = "phase-2b-raw-secret-not-a-hash"
const PIN = "7394"

const GUESTS = [
  ["Ben", "player-ben"],
  ["Cleo", "player-cleo"],
  ["Drew", "player-drew"],
  ["Eden", "player-eden"],
  ["Finn", "player-finn"],
  ["Gia", "player-gia"],
  ["Hugo", "player-hugo"],
  ["Ivy", "player-ivy"],
] as const

const CALL_RANKS = new Set<Rank>(["A", "K", "Q", "J", "10"])

type Watch = { secrets: string[]; pin: string; hashes: string[] }

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function clock(start = 1_700_000_000_000) {
  let now = start
  return {
    now: () => now,
    set: (value: number) => {
      now = value
    },
    advance: (ms: number) => {
      now += ms
    },
  }
}

function deps(now: () => number, overrides?: Partial<LobbyDeps>): LobbyDeps {
  const codes = ["HJKLMN", "NPQRST", "UVWXYZ", "ABCDEF", "234567", "89ABCD"]
  let index = 0
  return {
    now,
    randomInt: overrides?.randomInt ?? (() => 0),
    randomCode: overrides?.randomCode ?? (() => codes[index++] ?? "HJKLMN"),
    randomSeed: overrides?.randomSeed,
    config: overrides?.config,
  }
}

function send(lobby: Lobby, connectionId: string, message: unknown) {
  return lobby.handle(connectionId, JSON.stringify(message))
}

function messages(lobby: Lobby, connectionId?: string) {
  return lobby.messages().filter((entry) => connectionId === undefined || entry.connectionId === connectionId)
}

function lastView(lobby: Lobby, connectionId: string): RoomView {
  const views = messages(lobby, connectionId).filter((entry) => entry.message.type === "view")
  const found = views.at(-1)
  if (!found || found.message.type !== "view") throw new Error(`no view for ${connectionId}`)
  return found.message
}

function lastError(lobby: Lobby, connectionId: string): string {
  const errors = messages(lobby, connectionId).filter((entry) => entry.message.type === "error")
  const found = errors.at(-1)
  if (!found || found.message.type !== "error") throw new Error(`no error for ${connectionId}`)
  return found.message.message
}

async function join(
  lobby: Lobby,
  connectionId: string,
  input: { playerId: string; secret: string; name: string; pin?: string; claimCode?: string },
) {
  await send(lobby, connectionId, { type: "join", ...input })
}

async function addGuests(lobby: Lobby, count: number, secretFor: (playerId: string) => string) {
  for (let index = 0; index < count; index += 1) {
    const guest = GUESTS[index]
    if (!guest) throw new Error("not enough guest names")
    await join(lobby, `c-${guest[1]}`, {
      playerId: guest[1],
      secret: secretFor(guest[1]),
      name: guest[0],
    })
  }
}

async function lockOrder(lobby: Lobby) {
  const last = lobby.record().seats.length - 1
  await send(lobby, "c-host", { type: "move_seat", from: last, to: 0 })
  await send(lobby, "c-host", { type: "move_seat", from: 0, to: last })
}

function connectionFor(lobby: Lobby, seat: number): string {
  const connectionId = lobby.record().seats[seat]?.connectionId
  if (!connectionId) throw new Error(`seat ${seat} is offline`)
  return connectionId
}

function hostConnection(lobby: Lobby): string {
  const room = lobby.record()
  const seat = room.seats.findIndex((item) => item.id === room.hostSeatId)
  return connectionFor(lobby, seat)
}

function requireMatch(lobby: Lobby) {
  const match = lobby.record().match
  if (!match) throw new Error("the match has not been dealt")
  return match
}

async function seat(options: {
  players: 5 | 9
  rounds: number
  secret?: string
  pin?: string
  seed?: () => Seed
  lock?: boolean
  config?: LobbyDeps["config"]
  now?: () => number
}) {
  const now = options.now ?? (() => 1_700_000_000_000)
  const secret = options.secret ?? SECRET
  const dependencies = deps(now, { randomSeed: options.seed, config: options.config })
  const lobby = Lobby.create(
    {
      code: "K7NQ2A",
      name: "Ava",
      playerId: "player-host",
      secretHash: await sha256Hex(secret),
    },
    dependencies,
  )
  await join(lobby, "c-host", { playerId: "player-host", secret, name: "Ava", pin: options.pin })
  await addGuests(lobby, options.players - 1, (playerId) => `secret-${playerId}`)
  if (options.rounds !== 5) await send(lobby, "c-host", { type: "set_rounds", rounds: options.rounds })
  if (options.lock) await lockOrder(lobby)
  await send(lobby, "c-host", { type: "start_match" })
  return { lobby, dependencies, secret }
}

function findSeed(playerCount: number, dealer: number, want: "callable" | "none" | "triple") {
  for (let n = 1; n < 200_000; n += 1) {
    const seed = [0x5100_0000 + n, 0x5200_0000, 0x5300_0000, 0x5400_0000] as Seed
    const state = createRound({ playerCount, dealer, seed })
    const opener = state.toAct
    if (opener === null) continue
    const hand = state.hands[opener] ?? []
    const callable = callableCards(hand)
    if (want === "none") {
      if (callable.length === 0) return { seed }
      continue
    }
    if (callable.length === 0) continue
    if (want === "callable") return { seed }
    const counts = new Map<string, { suit: Suit; rank: Rank; count: number }>()
    for (const card of hand) {
      const key = `${card.suit}:${card.rank}`
      const existing = counts.get(key)
      if (existing) existing.count += 1
      else counts.set(key, { suit: card.suit, rank: card.rank, count: 1 })
    }
    const triple = [...counts.values()].find((entry) => entry.count === 3 && CALL_RANKS.has(entry.rank))
    if (!triple) continue
    let missing: { suit: Suit; rank: Rank } | undefined
    for (const suit of ["C", "D", "H", "S"] as const) {
      for (const rank of ["A", "K", "Q", "J", "10"] as const) {
        if ((counts.get(`${suit}:${rank}`)?.count ?? 0) === 0) {
          missing = { suit, rank }
          break
        }
      }
      if (missing) break
    }
    if (!missing) continue
    return { seed, triple: { suit: triple.suit, rank: triple.rank }, missing }
  }
  throw new Error(`no ${want} deal in the search`)
}

function replayMatch(log: readonly GameLogEntry[]): MatchState {
  let match: MatchState | null = null
  let state: RoundState | null = null
  for (const entry of log) {
    if (entry.kind === "deal") {
      if (state?.phase === "scored" && state.result && match) match = recordRound(match, state.result)
      state = createRound({ playerCount: entry.playerCount, dealer: entry.dealer, seed: entry.seed })
      match ??= createMatch(entry.playerCount)
      continue
    }
    if (!state) throw new Error("the log has an action before the deal")
    const result = apply(state, entry.action)
    if (!result.ok) throw new Error(result.error)
    state = result.state
  }
  if (state?.phase === "scored" && state.result && match) match = recordRound(match, state.result)
  if (!match) throw new Error("the log has no deal")
  return match
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

function containsHand(value: unknown, hand: Card[]): boolean {
  if (Array.isArray(value)) {
    const same =
      hand.length > 0 &&
      value.length === hand.length &&
      value.every((card, index) => {
        if (!card || typeof card !== "object") return false
        const held = hand[index]
        return (
          "suit" in card &&
          "rank" in card &&
          "copy" in card &&
          card.suit === held?.suit &&
          card.rank === held?.rank &&
          card.copy === held?.copy
        )
      })
    if (same) return true
    return value.some((item) => containsHand(item, hand))
  }
  if (value && typeof value === "object") return Object.values(value).some((item) => containsHand(item, hand))
  return false
}

function expectNoErrors(lobby: Lobby, before: number) {
  const errors = lobby.messages().slice(before).filter((entry) => entry.message.type === "error")
  const error = errors[0]
  if (error && error.message.type === "error") throw new Error(error.message.message)
}

function assertPrivate(lobby: Lobby, before: number, watch: Watch) {
  const saved = requireMatch(lobby)
  const round = saved.round
  const seeds = saved.log.flatMap((entry) => (entry.kind === "deal" ? [entry.seed] : []))
  for (const entry of lobby.messages().slice(before)) {
    const text = JSON.stringify(entry.message)
    for (const secret of watch.secrets) expect(text).not.toContain(secret)
    expect(text).not.toContain(`"${watch.pin}"`)
    for (const hash of watch.hashes) expect(text).not.toContain(hash)
    for (const seed of seeds) {
      expect(text).not.toContain(JSON.stringify(seed))
      for (const word of seed) {
        if (word > 9_999) expect(text).not.toContain(String(word))
      }
    }
    const keys = keysOf(entry.message)
    expect(keys.has("seed")).toBe(false)
    expect(keys.has("hands")).toBe(false)
    expect(keys.has("tricks")).toBe(false)
    expect(keys.has("secret")).toBe(false)
    expect(keys.has("pin")).toBe(false)
    if (entry.message.type === "redeal") {
      expect(entry.message).toEqual({ type: "redeal" })
      continue
    }
    if (entry.message.type === "partner") {
      expect(round.revealedPartners).toContain(entry.message.seat)
      continue
    }
    if (entry.message.type !== "view" || !entry.message.game) continue
    const game = entry.message.game
    const seat = game.seat.seat
    expect(game.seat.hand).toEqual(round.hands[seat])
    expect(game.seat.revealedPartners).toEqual(round.revealedPartners)
    if (lobby.record().status === "finished") expect(game.winners).toEqual(winners(saved.match))
    else expect(game.winners).toBeNull()
    if (round.phase === "scored") {
      expect(game.leaderboard?.map((row) => row.total)).toEqual(saved.match.totals)
      expect(game.seat.result?.partners).toEqual(round.result?.partners)
    } else {
      expect(game.seat.result).toBeNull()
      expect(game.leaderboard).toBeNull()
      expect(keysOf(game.seat).has("partners")).toBe(false)
      expect(keysOf(game.seat).has("copiesHeld")).toBe(false)
      const hidden = (round.partners ?? []).filter((partner) => !round.revealedPartners.includes(partner))
      for (const partner of hidden) expect(game.seat.revealedPartners).not.toContain(partner)
    }
    if (game.seat.seat !== round.toAct) expect(game.legal).toBeNull()
    else if (game.legal?.plays) {
      for (const card of game.legal.plays) expect(game.seat.hand).toContainEqual(card)
    }
    for (let other = 0; other < round.playerCount; other += 1) {
      if (other === seat) continue
      const hand = round.hands[other] ?? []
      if (hand.length === 0) continue
      expect(containsHand(entry.message, hand)).toBe(false)
    }
  }
}

function assertSecretsStored(lobby: Lobby, watch: Watch) {
  const stored = JSON.stringify({ room: lobby.record(), events: lobby.events() })
  for (const secret of watch.secrets) expect(stored).not.toContain(secret)
  expect(stored).not.toContain(`"${watch.pin}"`)
  const keys = keysOf(lobby.record())
  expect(keys.has("secret")).toBe(false)
  expect(keys.has("pin")).toBe(false)
  expect(keys.has("secretHash")).toBe(true)
}

async function expectRejected(lobby: Lobby, connectionId: string, message: unknown, error: string) {
  const record = lobby.record()
  const events = lobby.events().length
  const sent = lobby.messages().length
  await send(lobby, connectionId, message)
  expect(lobby.record()).toEqual(record)
  expect(lobby.events()).toHaveLength(events)
  expect(lobby.messages().slice(sent)).toEqual([{ connectionId, message: { type: "error", message: error } }])
}

async function expectEngineReject(lobby: Lobby, connectionId: string, message: unknown, action: Action) {
  const round = requireMatch(lobby).round
  const result = apply(round, action)
  expect(result.ok).toBe(false)
  if (result.ok) return
  await expectRejected(lobby, connectionId, message, result.error)
}

async function oneLegal(lobby: Lobby, watch?: Watch) {
  const match = requireMatch(lobby)
  if (match.round.phase === "scored") {
    const before = lobby.messages().length
    await send(lobby, hostConnection(lobby), { type: "next_round" })
    expectNoErrors(lobby, before)
    expect(replayCurrentRound(requireMatch(lobby).log)).toEqual(requireMatch(lobby).round)
    if (watch) assertPrivate(lobby, before, watch)
    return
  }
  const actor = match.round.toAct
  if (actor === null) throw new Error(`nobody is to act in ${match.round.phase}`)
  const connectionId = connectionFor(lobby, actor)
  const view = lastView(lobby, connectionId)
  const legal = view.game?.legal
  if (!legal) throw new Error(`seat ${actor} has no legal moves`)
  const before = lobby.messages().length
  if (legal.bids) {
    if (match.round.highBid === null || !legal.bids.pass) {
      const amount = legal.bids.amounts[0]
      if (amount === undefined) throw new Error("the engine offered no bid")
      await send(lobby, connectionId, { type: "place_bid", amount })
    } else {
      await send(lobby, connectionId, { type: "pass" })
    }
  } else if (legal.calls && legal.calls.length > 0) {
    const card = legal.calls[0]
    if (!card) throw new Error("the engine offered no call")
    await send(lobby, connectionId, { type: "call_card", suit: card.suit, rank: card.rank })
  } else if (legal.plays && legal.plays.length > 0) {
    const card = legal.plays[0]
    if (!card) throw new Error("the engine offered no play")
    await send(lobby, connectionId, {
      type: "play_card",
      suit: card.suit,
      rank: card.rank,
      deckIndex: card.copy,
    })
  } else {
    throw new Error(`no legal move in ${match.round.phase}`)
  }
  expectNoErrors(lobby, before)
  expect(replayCurrentRound(requireMatch(lobby).log)).toEqual(requireMatch(lobby).round)
  if (watch) assertPrivate(lobby, before, watch)
}

async function playUntil(lobby: Lobby, phase: RoundState["phase"]) {
  for (let guard = 0; guard < 500 && requireMatch(lobby).round.phase !== phase; guard += 1) {
    if (lobby.record().status === "finished") throw new Error("the match finished first")
    await oneLegal(lobby)
  }
  expect(requireMatch(lobby).round.phase).toBe(phase)
}

async function playToFinished(table: Lobby, options?: { watch?: Watch; restore?: LobbyDeps }): Promise<Lobby> {
  let lobby = table
  let restored = false
  for (let guard = 0; guard < 2_500 && lobby.record().status !== "finished"; guard += 1) {
    await oneLegal(lobby, options?.watch)
    if (options?.restore && !restored && requireMatch(lobby).log.filter((entry) => entry.kind === "action").length >= 3) {
      const saved = lobby.record()
      const next = Lobby.restore(saved, options.restore)
      expect(next.record()).toEqual(saved)
      expect(replayCurrentRound(requireMatch(next).log)).toEqual(requireMatch(next).round)
      for (const seat of saved.seats) {
        if (!seat.playerId || !seat.connectionId) continue
        const secret = seat.playerId === "player-host" ? SECRET : `secret-${seat.playerId}`
        await join(next, seat.connectionId, { playerId: seat.playerId, secret, name: seat.name })
      }
      lobby = next
      restored = true
    }
  }
  if (options?.restore && !restored) throw new Error("the round ended before the log could be restored")
  expect(lobby.record().status).toBe("finished")
  return lobby
}

function expectDealShape(lobby: Lobby, players: 5 | 9) {
  const room = lobby.record()
  const match = requireMatch(lobby)
  const hostSeat = room.seats.findIndex((seat) => seat.id === room.hostSeatId)
  expect(match.round.dealer).toBe(hostSeat)
  expect(match.round.hands).toHaveLength(players)
  expect(match.round.hands.every((hand) => hand.length === HAND_SIZE)).toBe(true)
  expect(match.round.hands.flat()).toHaveLength(players * HAND_SIZE)
  const opener = match.round.toAct
  if (opener === null) throw new Error("the deal has nobody to bid")
  expect(lastView(lobby, connectionFor(lobby, opener)).game?.legal?.bids?.amounts).toEqual([BID_FLOORS[players]])
  expect(BID_FLOORS[players]).toBe(bidFloor(players))
}

function expectRotation(log: readonly GameLogEntry[], players: number, rounds: number) {
  const firstDealer = new Map<number, number>()
  for (const entry of log) {
    if (entry.kind !== "deal") continue
    const seen = firstDealer.get(entry.roundNumber)
    if (seen === undefined) firstDealer.set(entry.roundNumber, entry.dealer)
    else expect(entry.dealer).toBe(seen)
  }
  const order = [...firstDealer.entries()].sort((left, right) => left[0] - right[0])
  expect(order.map(([round]) => round)).toEqual(Array.from({ length: rounds }, (_, index) => index + 1))
  for (let index = 1; index < order.length; index += 1) {
    expect(order[index]?.[1]).toBe(nextDealer(order[index - 1]?.[1] ?? 0, players))
  }
}

describe("match", () => {
  it("draws a fresh 128-bit seed for each deal", () => {
    const seed = freshSeed()
    expect(seed).toHaveLength(4)
    for (const word of seed) expect(word).toBe(word >>> 0)
    expect(freshSeed()).not.toEqual(seed)
  })

  it("plays a five-player match of 3 rounds to the engine's leaderboard", async () => {
    const { lobby } = await seat({ players: 5, rounds: 3 })
    expectDealShape(lobby, 5)
    expect(requireMatch(lobby).round.hands.flat()).toHaveLength(60)
    const done = await playToFinished(lobby)
    const saved = requireMatch(done)
    expect(saved.match.rounds).toHaveLength(3)
    expect(saved.match.totals).toEqual(replayMatch(saved.log).totals)
    expectRotation(saved.log, 5, 3)
    const view = lastView(done, hostConnection(done))
    expect(view.status).toBe("finished")
    expect(view.game?.winners).toEqual(winners(saved.match))
    expect(view.game?.leaderboard?.map((row) => row.total)).toEqual(saved.match.totals)
    expect(view.game?.seat.result?.scoreChanges).toEqual(saved.match.rounds[2]?.scoreChanges)
  }, 30_000)

  it("rejects illegal actions and leaves the room untouched", async () => {
    const found = findSeed(5, 0, "triple")
    if (!found.triple || !found.missing) throw new Error("the search did not return a triple")
    const triple = found.triple
    const missing = found.missing
    const { lobby } = await seat({
      players: 5,
      rounds: 5,
      lock: true,
      seed: () => found.seed,
    })
    const opener = requireMatch(lobby).round.toAct
    if (opener === null) throw new Error("nobody is to bid")
    const other = (opener + 1) % 5
    await expectEngineReject(lobby, connectionFor(lobby, other), { type: "pass" }, { type: "pass", seat: other })
    await expectEngineReject(
      lobby,
      connectionFor(lobby, opener),
      { type: "place_bid", amount: bidFloor(5) - 10 },
      { type: "bid", seat: opener, amount: bidFloor(5) - 10 },
    )
    await expectEngineReject(
      lobby,
      connectionFor(lobby, opener),
      { type: "place_bid", amount: bidFloor(5) + 20 },
      { type: "bid", seat: opener, amount: bidFloor(5) + 20 },
    )

    const guest = connectionFor(lobby, other)
    await expectRejected(lobby, guest, { type: "pause_match" }, "Only the host can do that")
    await send(lobby, "c-host", { type: "pause_match" })
    expect(lobby.record().status).toBe("paused")
    expect(lastView(lobby, connectionFor(lobby, opener)).game?.legal).toBeNull()
    await expectRejected(
      lobby,
      connectionFor(lobby, opener),
      { type: "place_bid", amount: bidFloor(5) },
      "The match is paused.",
    )
    await expectRejected(lobby, "c-host", { type: "next_round" }, "The match is paused.")
    await expectRejected(lobby, guest, { type: "resume_match" }, "Only the host can do that")
    await send(lobby, "c-host", { type: "resume_match" })
    expect(lobby.record().status).toBe("playing")

    await playUntil(lobby, "call")
    const bidder = requireMatch(lobby).round.toAct
    if (bidder === null) throw new Error("nobody is to call")
    await expectEngineReject(
      lobby,
      connectionFor(lobby, bidder),
      { type: "call_card", suit: triple.suit, rank: triple.rank },
      { type: "call", seat: bidder, card: triple },
    )
    await expectEngineReject(
      lobby,
      connectionFor(lobby, bidder),
      { type: "call_card", suit: missing.suit, rank: missing.rank },
      { type: "call", seat: bidder, card: missing },
    )
    const legalCall = lastView(lobby, connectionFor(lobby, bidder)).game?.legal?.calls?.[0]
    if (!legalCall) throw new Error("the bidder has no legal call")
    await send(lobby, connectionFor(lobby, bidder), { type: "call_card", ...legalCall })
    expect(requireMatch(lobby).round.phase).toBe("play")

    const leader = requireMatch(lobby).round.toAct
    if (leader === null) throw new Error("nobody is to lead")
    const foreign = requireMatch(lobby).round.hands.find((hand, index) => index !== leader && hand.length > 0)?.[0]
    if (!foreign) throw new Error("there is no other card")
    await expectEngineReject(
      lobby,
      connectionFor(lobby, leader),
      { type: "play_card", suit: foreign.suit, rank: foreign.rank, deckIndex: foreign.copy },
      { type: "play", seat: leader, card: foreign },
    )

    let followed = false
    for (let guard = 0; guard < 80 && !followed; guard += 1) {
      const round = requireMatch(lobby).round
      if (round.phase !== "play" || round.toAct === null || round.currentTrick.length === 0) {
        await oneLegal(lobby)
        continue
      }
      const view = lastView(lobby, connectionFor(lobby, round.toAct))
      const legal = view.game?.legal?.plays ?? []
      const illegal = view.game?.seat.hand.find(
        (card) => !legal.some((item) => item.suit === card.suit && item.rank === card.rank && item.copy === card.copy),
      )
      if (!illegal) {
        await oneLegal(lobby)
        continue
      }
      await expectEngineReject(
        lobby,
        connectionFor(lobby, round.toAct),
        { type: "play_card", suit: illegal.suit, rank: illegal.rank, deckIndex: illegal.copy },
        { type: "play", seat: round.toAct, card: illegal },
      )
      followed = true
    }
    expect(followed).toBe(true)
    await expectRejected(lobby, guest, { type: "end_match" }, "Only the host can do that")
  })

  it("shows each seat only its own cards, and never the seed or a hidden partner", async () => {
    const found = findSeed(5, 0, "callable")
    const secrets = [SECRET, ...GUESTS.slice(0, 4).map((guest) => `secret-${guest[1]}`)]
    const watch = {
      secrets,
      pin: PIN,
      hashes: [...(await Promise.all(secrets.map((secret) => sha256Hex(secret)))), await sha256Hex(PIN)],
    }
    const { lobby } = await seat({
      players: 5,
      rounds: 1,
      pin: PIN,
      lock: true,
      seed: () => found.seed,
    })
    const done = await playToFinished(lobby, { watch })
    assertSecretsStored(done, watch)
    expect(done.messages().some((entry) => entry.message.type === "partner")).toBe(true)
    expect(JSON.stringify(done.record())).toContain(JSON.stringify(found.seed))
    expect(JSON.stringify(done.messages())).not.toContain(JSON.stringify(found.seed))
  })

  it("redeals the same dealer and round when the bidder has no callable card", async () => {
    const bad = [49_304, 7, 8, 9] as Seed
    const good = [1, 2, 3, 4] as Seed
    const preview = createRound({ playerCount: 9, dealer: 0, seed: bad })
    const previewOpener = preview.toAct
    if (previewOpener === null) throw new Error("the preview has nobody to bid")
    expect(callableCards(preview.hands[previewOpener] ?? [])).toHaveLength(0)
    const seeds = [bad, good]
    let index = 0
    const { lobby } = await seat({
      players: 9,
      rounds: 3,
      lock: true,
      seed: () => {
        const next = seeds[index]
        index += 1
        if (!next) throw new Error("the test ran out of seeds")
        return next
      },
    })
    const dealer = requireMatch(lobby).round.dealer
    expect(dealer).toBe(0)
    expect(requireMatch(lobby).round.seed).toEqual(bad)
    await playUntil(lobby, "bidding")
    for (let guard = 0; guard < 20 && requireMatch(lobby).log.filter((entry) => entry.kind === "deal").length < 2; guard += 1) {
      await oneLegal(lobby)
    }
    const saved = requireMatch(lobby)
    expect(saved.roundNumber).toBe(1)
    expect(saved.round.dealer).toBe(dealer)
    expect(saved.round.seed).toEqual(good)
    expect(saved.round.seed).not.toEqual(bad)
    expect(saved.round.phase).toBe("bidding")
    expect(lobby.record().status).toBe("playing")
    const deals = saved.log.filter((entry) => entry.kind === "deal")
    expect(deals).toHaveLength(2)
    const second = saved.log.findLastIndex((entry) => entry.kind === "deal")
    const abandoned = replayCurrentRound(saved.log.slice(0, second))
    expect(abandoned.phase).toBe("redeal")
    expect(abandoned.dealer).toBe(dealer)
    expect(replayCurrentRound(saved.log)).toEqual(saved.round)
    const notices = lobby.messages().filter((entry) => entry.message.type === "redeal")
    expect(notices.length).toBeGreaterThan(0)
    for (const notice of notices) {
      expect(notice.message).toEqual({ type: "redeal" })
      expect(JSON.stringify(notice.message)).not.toContain(JSON.stringify(bad))
      expect(JSON.stringify(notice.message)).not.toContain(JSON.stringify(good))
    }
  })

  it("makes the dealer open at the floor when everyone else passes", async () => {
    const { lobby } = await seat({ players: 5, rounds: 3, lock: true, seed: () => [11, 22, 33, 44] })
    const dealer = requireMatch(lobby).round.dealer
    expect(dealer).toBe(0)
    while (requireMatch(lobby).round.toAct !== dealer) {
      const actor = requireMatch(lobby).round.toAct
      if (actor === null) throw new Error("nobody is to pass")
      await send(lobby, connectionFor(lobby, actor), { type: "pass" })
    }
    expect(requireMatch(lobby).round.highBid).toBeNull()
    await expectEngineReject(
      lobby,
      connectionFor(lobby, dealer),
      { type: "pass" },
      { type: "pass", seat: dealer },
    )
    const amount = bidFloor(5)
    await send(lobby, connectionFor(lobby, dealer), { type: "place_bid", amount })
    expect(requireMatch(lobby).round.highBid).toBe(amount)
    expect(requireMatch(lobby).round.highBidder).toBe(dealer)
    expect(amount).toBe(BID_FLOORS[5])
  })

  it("waits through a disconnect, a pause, and a released seat", async () => {
    const time = clock()
    const callable = findSeed(5, 0, "callable").seed
    const { lobby } = await seat({
      players: 5,
      rounds: 1,
      now: time.now,
      config: { matchRetentionMs: 5_000, hostHandoverMs: 60_000, lobbyExpiryMs: 1_000 },
      seed: () => callable,
      lock: true,
    })
    await playUntil(lobby, "play")
    await oneLegal(lobby)
    const trick = requireMatch(lobby).round.currentTrick
    expect(trick.length).toBeGreaterThan(0)
    const actor = requireMatch(lobby).round.toAct
    if (actor === null) throw new Error("nobody is to play")
    const person = lobby.record().seats[actor]
    if (!person?.connectionId || !person.playerId) throw new Error("the actor has no seat")
    const secret = person.playerId === "player-host" ? SECRET : `secret-${person.playerId}`
    const hand = requireMatch(lobby).round.hands[actor]
    lobby.close(person.connectionId)
    const parked = lobby.record()
    lobby.alarm()
    expect(requireMatch(lobby).round).toEqual(parked.match?.round)
    expect(lobby.record().seats[actor]?.connected).toBe(false)
    const bystander = lobby.record().seats.findIndex((seat, index) => index !== actor && seat.connectionId)
    const sample = hand?.[0]
    if (!sample || bystander < 0) throw new Error("cannot probe the waiting seat")
    await expectEngineReject(
      lobby,
      connectionFor(lobby, bystander),
      { type: "play_card", suit: sample.suit, rank: sample.rank, deckIndex: sample.copy },
      { type: "play", seat: bystander, card: sample },
    )
    await join(lobby, "c-back", { playerId: person.playerId, secret, name: person.name })
    const returned = lastView(lobby, "c-back")
    expect(returned.game?.seat.hand).toEqual(hand)
    expect(returned.game?.seat.currentTrick).toEqual(trick)
    expect(returned.you.seat).toBe(actor)

    await send(lobby, hostConnection(lobby), { type: "pause_match" })
    expect(lobby.record().status).toBe("paused")
    const legal = lastView(lobby, "c-back").game?.seat.hand[0]
    if (!legal) throw new Error("the reconnected hand is empty")
    await expectRejected(
      lobby,
      "c-back",
      { type: "play_card", suit: legal.suit, rank: legal.rank, deckIndex: legal.copy },
      "The match is paused.",
    )
    expect(requireMatch(lobby).round.currentTrick).toEqual(trick)
    await send(lobby, hostConnection(lobby), { type: "resume_match" })
    expect(lobby.record().status).toBe("playing")
    await oneLegal(lobby)
    expect(requireMatch(lobby).round.currentTrick.length).not.toBe(trick.length)

    let released = requireMatch(lobby).round.toAct
    if (released === null) throw new Error("nobody is to play")
    if (lobby.record().seats[released]?.id === lobby.record().hostSeatId) {
      await oneLegal(lobby)
      released = requireMatch(lobby).round.toAct
    }
    if (released === null) throw new Error("nobody is to play")
    const releasedSeat = lobby.record().seats[released]
    if (!releasedSeat) throw new Error("missing seat")
    const kept = requireMatch(lobby).round.hands[released]
    await send(lobby, hostConnection(lobby), { type: "release_seat", seat: released })
    const claim = lastView(lobby, hostConnection(lobby)).claimCodes?.find((item) => item.seat === released)
    if (!claim) throw new Error("the host did not receive a claim code")
    const oldId = releasedSeat.connectionId
    if (oldId) {
      const leaked = messages(lobby, oldId).some((entry) => JSON.stringify(entry.message).includes(claim.code))
      expect(leaked).toBe(false)
    }
    await join(lobby, "c-claim", {
      playerId: "player-claim",
      secret: "claimed-secret",
      name: releasedSeat.name,
      claimCode: claim.code,
    })
    expect(lastView(lobby, "c-claim").game?.seat.hand).toEqual(kept)
    const done = await playToFinished(lobby)
    expect(done.record().status).toBe("finished")
    expect(requireMatch(done).match.rounds).toHaveLength(1)
  })

  it("rebuilds the current round from the log after every accepted action", async () => {
    const time = clock()
    const callable = findSeed(5, 0, "callable").seed
    const dependencies = deps(time.now, { randomSeed: () => callable })
    const secret = SECRET
    const lobby = Lobby.create(
      {
        code: "K7NQ2A",
        name: "Ava",
        playerId: "player-host",
        secretHash: await sha256Hex(secret),
      },
      dependencies,
    )
    await join(lobby, "c-host", { playerId: "player-host", secret, name: "Ava" })
    await addGuests(lobby, 4, (playerId) => `secret-${playerId}`)
    await send(lobby, "c-host", { type: "set_rounds", rounds: 1 })
    await lockOrder(lobby)
    await send(lobby, "c-host", { type: "start_match" })
    const done = await playToFinished(lobby, { restore: dependencies })
    const saved = requireMatch(done)
    expect(saved.match.totals).toEqual(replayMatch(saved.log).totals)
    expect(replayCurrentRound(saved.log)).toEqual(saved.round)
  })

  it("finishes a nine-player round at the 1,050 floor and a five-player round at 1,570", async () => {
    const nine = await seat({ players: 9, rounds: 1 })
    expectDealShape(nine.lobby, 9)
    expect(requireMatch(nine.lobby).round.hands.flat()).toHaveLength(108)
    expect(BID_FLOORS[9]).toBe(1_050)
    const nineDone = await playToFinished(nine.lobby)
    expect(requireMatch(nineDone).match.rounds).toHaveLength(1)
    expect(requireMatch(nineDone).match.totals).toEqual(replayMatch(requireMatch(nineDone).log).totals)

    const five = await seat({ players: 5, rounds: 1 })
    expectDealShape(five.lobby, 5)
    expect(requireMatch(five.lobby).round.hands.flat()).toHaveLength(60)
    expect(BID_FLOORS[5]).toBe(1_570)
    const fiveDone = await playToFinished(five.lobby)
    expect(requireMatch(fiveDone).match.rounds).toHaveLength(1)
    expect(requireMatch(fiveDone).round.phase).toBe("scored")
  }, 30_000)

  it("ends on completed rounds, keeps co-winners, and stays readable until retention", async () => {
    const time = clock()
    const callable = findSeed(5, 0, "callable").seed
    const { lobby, secret } = await seat({
      players: 5,
      rounds: 3,
      now: time.now,
      lock: true,
      config: { matchRetentionMs: 5_000, hostHandoverMs: 60_000 },
      seed: () => callable,
    })
    await playUntil(lobby, "scored")
    const scored = requireMatch(lobby)
    expect(scored.match.rounds).toHaveLength(1)
    expect(scored.roundNumber).toBe(1)
    const totals = [...scored.match.totals]
    const guest = connectionFor(lobby, 1)
    await expectRejected(lobby, guest, { type: "next_round" }, "Only the host can do that")
    await send(lobby, "c-host", { type: "next_round" })
    expect(requireMatch(lobby).roundNumber).toBe(2)
    expect(requireMatch(lobby).round.phase).toBe("bidding")
    expect(requireMatch(lobby).round.dealer).toBe(nextDealer(0, 5))
    await expectRejected(lobby, guest, { type: "end_match" }, "Only the host can do that")
    await send(lobby, "c-host", { type: "end_match" })
    expect(lobby.record().status).toBe("finished")
    expect(requireMatch(lobby).match.rounds).toHaveLength(1)
    expect(requireMatch(lobby).match.totals).toEqual(totals)
    const view = lastView(lobby, "c-host")
    expect(view.game?.winners).toEqual(winners(requireMatch(lobby).match))
    expect(view.game?.leaderboard?.map((row) => row.total)).toEqual(totals)
    await expectRejected(lobby, guest, { type: "pass" }, "The match is over.")

    const tied = Lobby.restore(lobby.record(), deps(time.now))
    await send(tied, "c-host", { type: "join", playerId: "player-host", secret, name: "Ava" })
    expect(lastView(tied, "c-host").status).toBe("finished")
    expect(lastView(tied, "c-host").game?.winners?.length).toBeGreaterThan(0)

    const zeroes = await seat({ players: 5, rounds: 3, lock: true, seed: () => [8, 7, 6, 5] })
    await send(zeroes.lobby, "c-host", { type: "end_match" })
    expect(lastView(zeroes.lobby, "c-host").game?.winners).toEqual(winners(requireMatch(zeroes.lobby).match))
    expect(lastView(zeroes.lobby, "c-host").game?.winners).toHaveLength(5)

    expect(lobby.nextAlarmAt()).toBe(time.now() + 5_000)
    lobby.close("c-host")
    await join(lobby, "c-again", { playerId: "player-host", secret, name: "Ava" })
    expect(lastView(lobby, "c-again").status).toBe("finished")
    expect(lastView(lobby, "c-again").game?.winners).toEqual(winners(requireMatch(lobby).match))
    const activity = lobby.record().lastActivityAt
    time.set(activity + 4_999)
    lobby.alarm()
    expect(lobby.record().status).toBe("finished")
    time.set(activity + 5_000)
    lobby.alarm()
    expect(lobby.record().status).toBe("expired")
  })
})
