import {
  apply,
  createMatch,
  legalBids,
  legalCalls,
  legalPlays,
  nextDealer,
  recordRound,
  viewFor,
  winners,
} from "@hidden-partner/rules"
import type { Action, MatchState, Rank, RoundState, Seed, Suit } from "@hidden-partner/rules"
import type { SeatView as EngineSeatView } from "@hidden-partner/rules"
import { config } from "./config.ts"
import type { TimingConfig } from "./config.ts"
import { hashPin, randomSalt, safeEqual, sha256Hex } from "./hash.ts"
import { parseClientMessage, parseCreateBody } from "./messages.ts"
import type { ClientMessage } from "./messages.ts"
import { dealRound, freshSeed, playAction } from "./play.ts"
import type { GameLogEntry } from "./play.ts"

export type LobbyDeps = {
  now: () => number
  randomInt: (exclusiveMax: number) => number
  randomCode: () => string
  randomSeed?: () => Seed
  config?: Partial<TimingConfig>
}

export type SeatRecord = {
  id: string
  playerId: string | null
  name: string
  secretHash: string | null
  pinSalt: string | null
  pinHash: string | null
  connected: boolean
  seatedAt: number
  connectionId: string | null
  pinAttempts: number
  pinLockedUntil: number | null
  claimCode: string | null
}

export type MatchRecord = {
  roundNumber: number
  match: MatchState
  round: RoundState
  log: GameLogEntry[]
}

export type RoomRecord = {
  code: string
  status: "lobby" | "playing" | "paused" | "finished" | "expired"
  rounds: number
  roundsLocked: boolean
  playersLocked: boolean
  rearranged: boolean
  hostSeatId: string
  hostDisconnectedAt: number | null
  createdAt: number
  lastActivityAt: number
  nextEventId: number
  nextSeatId: number
  seats: SeatRecord[]
  match: MatchRecord | null
}

export type RoomEvent = {
  id: number
  at: number
  connectionId: string | null
  message: unknown
  result: "ok" | "error"
  error?: string
}

export type SeatView = {
  seat: number
  name: string
  connected: boolean
}

export type LegalChoices = {
  bids: { pass: boolean; amounts: number[] } | null
  calls: { suit: Suit; rank: Rank }[] | null
  plays: { suit: Suit; rank: Rank; copy: number }[] | null
}

export type GameView = {
  roundNumber: number
  seat: EngineSeatView
  legal: LegalChoices | null
  leaderboard: { seat: number; name: string; total: number }[] | null
  winners: number[] | null
}

export type RoomView = {
  type: "view"
  code: string
  status: "lobby" | "playing" | "paused" | "finished"
  rounds: number
  hostSeat: number
  you: { seat: number; name: string }
  seats: SeatView[]
  claimCodes?: { seat: number; code: string }[]
  game?: GameView
}

export type ErrorMessage = { type: "error"; message: string }

export type TableNotice = { type: "redeal" } | { type: "partner"; seat: number; trickNumber: number }

export type Outbound = { connectionId: string; message: RoomView | ErrorMessage | TableNotice }

type CreateInput = {
  code: string
  name: string
  playerId: string
  secretHash: string
}

export function connectionError(record: RoomRecord | null): string | null {
  if (!record) return "Room not found"
  if (record.status === "expired") return "This room has expired"
  return null
}

export class Lobby {
  #deps: LobbyDeps
  #timing: TimingConfig
  #code = ""
  #status: RoomRecord["status"] = "lobby"
  #rounds = 5
  #roundsLocked = false
  #playersLocked = false
  #rearranged = false
  #hostSeatId = ""
  #hostDisconnectedAt: number | null = null
  #createdAt = 0
  #lastActivityAt = 0
  #nextEventId = 1
  #nextSeatId = 1
  #seats: SeatRecord[] = []
  #events: RoomEvent[] = []
  #sent: Outbound[] = []
  #pending: Outbound[] = []
  #roundNumber = 0
  #engineMatch: MatchState | null = null
  #round: RoundState | null = null
  #log: GameLogEntry[] = []
  #randomSeed: () => Seed

  private constructor(dependencies: LobbyDeps) {
    this.#deps = dependencies
    this.#timing = { ...config, ...dependencies.config }
    this.#randomSeed = dependencies.randomSeed ?? freshSeed
  }

  static create(input: CreateInput, dependencies: LobbyDeps): Lobby {
    const parsed = parseCreateBody(input)
    if (!parsed.ok) throw new Error(parsed.message)
    if (!input.code) throw new Error("Invalid room code")
    const lobby = new Lobby(dependencies)
    const now = lobby.#now()
    const seat = lobby.#blankSeat(parsed.data.name, now)
    seat.playerId = parsed.data.playerId
    seat.secretHash = parsed.data.secretHash
    lobby.#code = input.code
    lobby.#seats = [seat]
    lobby.#hostSeatId = seat.id
    lobby.#createdAt = now
    lobby.#lastActivityAt = now
    return lobby
  }

  static restore(record: RoomRecord, dependencies: LobbyDeps): Lobby {
    const lobby = new Lobby(dependencies)
    lobby.#code = record.code
    lobby.#status = record.status
    lobby.#rounds = record.rounds
    lobby.#roundsLocked = record.roundsLocked
    lobby.#playersLocked = record.playersLocked
    lobby.#rearranged = record.rearranged
    lobby.#hostSeatId = record.hostSeatId
    lobby.#hostDisconnectedAt = record.hostDisconnectedAt
    lobby.#createdAt = record.createdAt
    lobby.#lastActivityAt = record.lastActivityAt
    lobby.#nextEventId = record.nextEventId
    lobby.#nextSeatId = record.nextSeatId
    lobby.#seats = record.seats.map((seat) => ({ ...seat }))
    const match = record.match ? structuredClone(record.match) : null
    lobby.#roundNumber = match?.roundNumber ?? 0
    lobby.#engineMatch = match?.match ?? null
    lobby.#round = match?.round ?? null
    lobby.#log = match?.log ?? []
    return lobby
  }

  record(): RoomRecord {
    return structuredClone({
      code: this.#code,
      status: this.#status,
      rounds: this.#rounds,
      roundsLocked: this.#roundsLocked,
      playersLocked: this.#playersLocked,
      rearranged: this.#rearranged,
      hostSeatId: this.#hostSeatId,
      hostDisconnectedAt: this.#hostDisconnectedAt,
      createdAt: this.#createdAt,
      lastActivityAt: this.#lastActivityAt,
      nextEventId: this.#nextEventId,
      nextSeatId: this.#nextSeatId,
      seats: this.#seats,
      match: this.#matchRecord(),
    })
  }

  events(): RoomEvent[] {
    return this.#events.map((event) => structuredClone(event))
  }

  messages(): Outbound[] {
    return this.#sent.map((entry) => structuredClone(entry))
  }

  takePending(): Outbound[] {
    const pending = this.#pending
    this.#pending = []
    return pending
  }

  nextAlarmAt(): number | null {
    if (this.#status === "expired") return null
    const times: number[] = []
    if (this.#status === "lobby") times.push(this.#lastActivityAt + this.#timing.lobbyExpiryMs)
    if (this.#status === "playing" || this.#status === "paused" || this.#status === "finished") {
      times.push(this.#lastActivityAt + this.#timing.matchRetentionMs)
    }
    if (this.#hostDisconnectedAt != null) {
      const due = this.#hostDisconnectedAt + this.#timing.hostHandoverMs
      const someoneElse = this.#seats.some((seat) => seat.connected && seat.id !== this.#hostSeatId)
      times.push(someoneElse ? due : this.#now() + this.#timing.hostHandoverMs)
    }
    return Math.min(...times)
  }

  reconcile(live: ReadonlySet<string>): void {
    let hostDropped = false
    for (const seat of this.#seats) {
      if (!seat.connectionId || live.has(seat.connectionId)) continue
      if (seat.id === this.#hostSeatId) hostDropped = true
      seat.connectionId = null
      seat.connected = false
    }
    if (hostDropped && this.#hostDisconnectedAt == null) this.#hostDisconnectedAt = this.#now()
  }

  close(connectionId: string): void {
    const seat = this.#seats.find((item) => item.connectionId === connectionId)
    if (!seat) return
    seat.connected = false
    seat.connectionId = null
    if (seat.id === this.#hostSeatId && this.#hostDisconnectedAt == null) {
      this.#hostDisconnectedAt = this.#now()
    }
    this.#broadcast()
  }

  alarm(): void {
    if (this.#status === "expired") return
    const now = this.#now()
    if (this.#status === "lobby" && now >= this.#lastActivityAt + this.#timing.lobbyExpiryMs) {
      this.#expire()
      return
    }
    if (
      (this.#status === "playing" || this.#status === "paused" || this.#status === "finished") &&
      now >= this.#lastActivityAt + this.#timing.matchRetentionMs
    ) {
      this.#expire()
      return
    }
    if (this.#handoverIfDue()) this.#broadcast()
  }

  async handle(connectionId: string, raw: string): Promise<void> {
    if (this.#status === "expired") {
      this.#pushOut(connectionId, { type: "error", message: "This room has expired" })
      return
    }
    if (byteLength(raw) > this.#timing.maxMessageBytes) {
      this.#pushEvent(connectionId, { type: "rejected", reason: "too_large" }, "error", "Message too large")
      this.#pushOut(connectionId, { type: "error", message: "Message too large" })
      return
    }
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      this.#pushEvent(connectionId, { type: "rejected", reason: "unparsed" }, "error", "Invalid message")
      this.#pushOut(connectionId, { type: "error", message: "Invalid message" })
      return
    }
    const parsed = parseClientMessage(body, this.#timing)
    if (!parsed.ok) {
      this.#pushEvent(connectionId, body, "error", parsed.message)
      this.#pushOut(connectionId, { type: "error", message: parsed.message })
      return
    }
    this.#lastActivityAt = this.#now()
    await this.#dispatch(connectionId, parsed.data)
  }

  async #dispatch(connectionId: string, message: ClientMessage): Promise<void> {
    if (message.type === "join") {
      await this.#join(connectionId, message)
      return
    }
    if (message.type === "set_rounds") {
      this.#setRounds(connectionId, message.rounds, message)
      return
    }
    if (message.type === "move_seat") {
      this.#moveSeat(connectionId, message.from, message.to, message)
      return
    }
    if (message.type === "remove_player") {
      this.#removePlayer(connectionId, message.seat, message)
      return
    }
    if (message.type === "release_seat") {
      this.#releaseSeat(connectionId, message.seat, message)
      return
    }
    if (message.type === "start_match") {
      this.#startMatch(connectionId, message)
      return
    }
    if (message.type === "place_bid") {
      this.#placeBid(connectionId, message)
      return
    }
    if (message.type === "pass") {
      this.#pass(connectionId, message)
      return
    }
    if (message.type === "call_card") {
      this.#callCard(connectionId, message)
      return
    }
    if (message.type === "play_card") {
      this.#playCard(connectionId, message)
      return
    }
    if (message.type === "next_round") {
      this.#nextRound(connectionId, message)
      return
    }
    if (message.type === "pause_match") {
      this.#pauseMatch(connectionId, message)
      return
    }
    if (message.type === "resume_match") {
      this.#resumeMatch(connectionId, message)
      return
    }
    this.#endMatch(connectionId, message)
  }

  async #join(connectionId: string, message: Extract<ClientMessage, { type: "join" }>): Promise<void> {
    const existing = this.#seats.find((seat) => seat.playerId !== null && seat.playerId === message.playerId)
    if (existing) {
      const actual = await sha256Hex(message.secret)
      if (!existing.secretHash || !safeEqual(actual, existing.secretHash)) {
        this.#fail(connectionId, message, "Wrong secret")
        return
      }
      this.#attach(existing, connectionId)
      if (message.pin && !existing.pinHash) await this.#setPin(existing, message.pin)
      if (existing.id === this.#hostSeatId) this.#hostDisconnectedAt = null
      this.#handoverIfDue()
      this.#succeed(connectionId, message)
      return
    }

    if (message.claimCode) {
      await this.#claimReleased(connectionId, message)
      return
    }

    if (message.pin) {
      const named = this.#seats.find((seat) => seat.name === message.name)
      if (named) {
        await this.#reclaimWithPin(connectionId, named, message)
        return
      }
    }

    if (this.#status !== "lobby" || this.#playersLocked) {
      this.#fail(connectionId, message, "The match has already started")
      return
    }
    if (this.#seats.length >= 9) {
      this.#fail(connectionId, message, "Room full")
      return
    }

    const seat = this.#blankSeat(uniqueName(this.#seats, message.name), this.#now())
    seat.playerId = message.playerId
    seat.secretHash = await sha256Hex(message.secret)
    seat.connected = true
    seat.connectionId = connectionId
    if (message.pin) await this.#setPin(seat, message.pin)
    this.#seats.push(seat)
    this.#handoverIfDue()
    this.#succeed(connectionId, message)
  }

  async #claimReleased(
    connectionId: string,
    message: Extract<ClientMessage, { type: "join" }>,
  ): Promise<void> {
    const seat = this.#seats.find(
      (item) =>
        item.claimCode !== null &&
        item.name === message.name &&
        message.claimCode !== undefined &&
        safeEqual(item.claimCode, message.claimCode),
    )
    if (!seat) {
      this.#fail(connectionId, message, "That name and code do not match a released seat")
      return
    }
    seat.playerId = message.playerId
    seat.secretHash = await sha256Hex(message.secret)
    seat.claimCode = null
    seat.pinAttempts = 0
    seat.pinLockedUntil = null
    if (message.pin) await this.#setPin(seat, message.pin)
    else {
      seat.pinHash = null
      seat.pinSalt = null
    }
    this.#attach(seat, connectionId)
    if (seat.id === this.#hostSeatId) this.#hostDisconnectedAt = null
    this.#handoverIfDue()
    this.#succeed(connectionId, message)
  }

  async #reclaimWithPin(
    connectionId: string,
    seat: SeatRecord,
    message: Extract<ClientMessage, { type: "join" }>,
  ): Promise<void> {
    if (seat.claimCode) {
      this.#fail(connectionId, message, "This seat was released. Use the claim code from the host.")
      return
    }
    if (seat.pinLockedUntil !== null && this.#now() >= seat.pinLockedUntil) {
      seat.pinLockedUntil = null
      seat.pinAttempts = 0
    }
    if (seat.pinLockedUntil !== null && this.#now() < seat.pinLockedUntil) {
      this.#fail(connectionId, message, "This seat is locked")
      return
    }
    if (!seat.pinHash || !seat.pinSalt || !message.pin) {
      this.#fail(connectionId, message, "This seat has no PIN")
      return
    }
    const actual = await hashPin(message.pin, seat.pinSalt)
    if (!safeEqual(actual, seat.pinHash)) {
      seat.pinAttempts += 1
      if (seat.pinAttempts >= this.#timing.pinMaxAttempts) {
        seat.pinLockedUntil = this.#now() + this.#timing.pinLockoutMs
        this.#fail(connectionId, message, "This seat is locked")
        return
      }
      this.#fail(connectionId, message, "Wrong PIN")
      return
    }
    seat.pinAttempts = 0
    seat.pinLockedUntil = null
    seat.playerId = message.playerId
    seat.secretHash = await sha256Hex(message.secret)
    this.#attach(seat, connectionId)
    if (seat.id === this.#hostSeatId) this.#hostDisconnectedAt = null
    this.#handoverIfDue()
    this.#succeed(connectionId, message)
  }

  #setRounds(connectionId: string, rounds: number, message: ClientMessage): void {
    if (!this.#isHost(connectionId)) {
      this.#fail(connectionId, message, "Only the host can do that")
      return
    }
    if (this.#roundsLocked || this.#status !== "lobby") {
      this.#fail(connectionId, message, "Rounds are locked")
      return
    }
    this.#rounds = rounds
    this.#succeed(connectionId, message)
  }

  #moveSeat(connectionId: string, from: number, to: number, message: ClientMessage): void {
    if (!this.#isHost(connectionId)) {
      this.#fail(connectionId, message, "Only the host can do that")
      return
    }
    if (this.#status !== "lobby" || this.#playersLocked) {
      this.#fail(connectionId, message, "Only available in the lobby")
      return
    }
    if (from >= this.#seats.length || to >= this.#seats.length) {
      this.#fail(connectionId, message, "Seat is out of range")
      return
    }
    if (from !== to) {
      const [seat] = this.#seats.splice(from, 1)
      if (seat) this.#seats.splice(to, 0, seat)
      this.#rearranged = true
    }
    this.#succeed(connectionId, message)
  }

  #removePlayer(connectionId: string, index: number, message: ClientMessage): void {
    if (!this.#isHost(connectionId)) {
      this.#fail(connectionId, message, "Only the host can do that")
      return
    }
    if (this.#status !== "lobby" || this.#playersLocked) {
      this.#fail(connectionId, message, "Only available in the lobby")
      return
    }
    const seat = this.#seats[index]
    if (!seat) {
      this.#fail(connectionId, message, "Seat is out of range")
      return
    }
    if (seat.id === this.#hostSeatId) {
      this.#fail(connectionId, message, "You cannot remove the host")
      return
    }
    this.#seats.splice(index, 1)
    if (seat.connectionId) {
      this.#pushOut(seat.connectionId, { type: "error", message: "The host removed you from the room" })
    }
    this.#succeed(connectionId, message)
  }

  #releaseSeat(connectionId: string, index: number, message: ClientMessage): void {
    if (!this.#isHost(connectionId)) {
      this.#fail(connectionId, message, "Only the host can do that")
      return
    }
    const seat = this.#seats[index]
    if (!seat) {
      this.#fail(connectionId, message, "Seat is out of range")
      return
    }
    if (this.#status === "lobby") {
      if (seat.id === this.#hostSeatId) {
        this.#fail(connectionId, message, "You cannot release the host")
        return
      }
      this.#seats.splice(index, 1)
      if (seat.connectionId) {
        this.#pushOut(seat.connectionId, { type: "error", message: "The host released your seat" })
      }
      this.#succeed(connectionId, message)
      return
    }
    if (seat.claimCode && !seat.playerId) {
      this.#fail(connectionId, message, "That seat is already released")
      return
    }
    const self = seat.connectionId === connectionId
    this.#clearIdentity(seat)
    seat.claimCode = this.#deps.randomCode()
    seat.connected = false
    if (self) {
      this.#pushEvent(connectionId, message, "ok")
      const view = this.#viewFor(connectionId)
      if (view) this.#pushOut(connectionId, view)
      seat.connectionId = null
      this.#broadcast()
      return
    }
    const previous = seat.connectionId
    seat.connectionId = null
    if (previous) this.#pushOut(previous, { type: "error", message: "The host released your seat" })
    this.#succeed(connectionId, message)
  }

  #startMatch(connectionId: string, message: ClientMessage): void {
    if (!this.#isHost(connectionId)) {
      this.#fail(connectionId, message, "Only the host can do that")
      return
    }
    if (this.#status !== "lobby") {
      this.#fail(connectionId, message, "The match has already started")
      return
    }
    if (this.#seats.length < 5 || this.#seats.length > 9) {
      this.#fail(connectionId, message, "Need between 5 and 9 players to start")
      return
    }
    if (!this.#rearranged) this.#seats = shuffleSeats(this.#seats, this.#deps.randomInt)
    const dealer = this.#seats.findIndex((seat) => seat.id === this.#hostSeatId)
    const playerCount = this.#seats.length
    const dealt = dealRound({
      playerCount,
      dealer,
      seed: this.#randomSeed(),
      roundNumber: 1,
    })
    this.#engineMatch = createMatch(playerCount)
    this.#roundNumber = 1
    this.#round = dealt.round
    this.#log = [dealt.entry]
    this.#status = "playing"
    this.#playersLocked = true
    this.#roundsLocked = true
    this.#succeed(connectionId, message)
  }

  #clearIdentity(seat: SeatRecord): void {
    seat.playerId = null
    seat.secretHash = null
    seat.pinSalt = null
    seat.pinHash = null
    seat.pinAttempts = 0
    seat.pinLockedUntil = null
  }

  async #setPin(seat: SeatRecord, pin: string): Promise<void> {
    seat.pinSalt = randomSalt()
    seat.pinHash = await hashPin(pin, seat.pinSalt)
  }

  #attach(seat: SeatRecord, connectionId: string): void {
    if (seat.connectionId && seat.connectionId !== connectionId) {
      this.#pushOut(seat.connectionId, { type: "error", message: "This seat was opened somewhere else" })
    }
    seat.connectionId = connectionId
    seat.connected = true
  }

  #handoverIfDue(): boolean {
    if (this.#hostDisconnectedAt == null) return false
    if (this.#now() < this.#hostDisconnectedAt + this.#timing.hostHandoverMs) return false
    const candidates = this.#seats
      .map((seat, index) => ({ seat, index }))
      .filter((item) => item.seat.connected && item.seat.id !== this.#hostSeatId)
    if (candidates.length === 0) return false
    candidates.sort((left, right) => left.seat.seatedAt - right.seat.seatedAt || left.index - right.index)
    const next = candidates[0]
    if (!next) return false
    this.#hostSeatId = next.seat.id
    this.#hostDisconnectedAt = null
    this.#pushEvent(null, { type: "host_handover", seat: next.index }, "ok")
    return true
  }

  #expire(): void {
    this.#status = "expired"
    this.#pushEvent(null, { type: "room_expired" }, "ok")
    for (const seat of this.#seats) {
      if (!seat.connectionId) continue
      this.#pushOut(seat.connectionId, { type: "error", message: "This room has expired" })
      seat.connectionId = null
      seat.connected = false
    }
  }

  #blankSeat(name: string, seatedAt: number): SeatRecord {
    const seat: SeatRecord = {
      id: `seat-${this.#nextSeatId}`,
      playerId: null,
      name,
      secretHash: null,
      pinSalt: null,
      pinHash: null,
      connected: false,
      seatedAt,
      connectionId: null,
      pinAttempts: 0,
      pinLockedUntil: null,
      claimCode: null,
    }
    this.#nextSeatId += 1
    return seat
  }

  #isHost(connectionId: string): boolean {
    const seat = this.#seats.find((item) => item.connectionId === connectionId)
    return seat?.id === this.#hostSeatId
  }

  #viewFor(connectionId: string): RoomView | null {
    const seatIndex = this.#seats.findIndex((seat) => seat.connectionId === connectionId)
    const seat = this.#seats[seatIndex]
    if (!seat || this.#status === "expired") return null
    const hostSeat = this.#seats.findIndex((item) => item.id === this.#hostSeatId)
    const live =
      this.#status === "playing" || this.#status === "paused" || this.#status === "finished"
        ? this.#status
        : "lobby"
    const view: RoomView = {
      type: "view",
      code: this.#code,
      status: live,
      rounds: this.#rounds,
      hostSeat,
      you: { seat: seatIndex, name: seat.name },
      seats: this.#seats.map((item, index) => ({
        seat: index,
        name: item.name,
        connected: item.connected,
      })),
    }
    if (this.#round && this.#engineMatch) {
      const showStandings = this.#status === "finished" || this.#round.phase === "scored"
      view.game = {
        roundNumber: this.#roundNumber,
        seat: viewFor(this.#round, seatIndex),
        legal: this.#legal(seatIndex),
        leaderboard: showStandings ? this.#leaderboard() : null,
        winners: this.#status === "finished" ? winners(this.#engineMatch) : null,
      }
    }
    if (seat.id === this.#hostSeatId) {
      const claimCodes = this.#seats.flatMap((item, index) =>
        item.claimCode ? [{ seat: index, code: item.claimCode }] : [],
      )
      if (claimCodes.length > 0) view.claimCodes = claimCodes
    }
    return view
  }

  #broadcast(): void {
    for (const seat of this.#seats) {
      if (!seat.connectionId) continue
      const view = this.#viewFor(seat.connectionId)
      if (view) this.#pushOut(seat.connectionId, view)
    }
  }

  #succeed(connectionId: string, message: unknown): void {
    this.#pushEvent(connectionId, message, "ok")
    this.#broadcast()
  }

  #fail(connectionId: string, message: unknown, error: string): void {
    this.#pushEvent(connectionId, message, "error", error)
    this.#pushOut(connectionId, { type: "error", message: error })
  }

  #pushEvent(connectionId: string | null, message: unknown, result: "ok" | "error", error?: string): void {
    const event: RoomEvent = {
      id: this.#nextEventId,
      at: this.#now(),
      connectionId,
      message: loggedMessage(message),
      result,
    }
    if (error) event.error = error
    this.#nextEventId += 1
    this.#events.push(event)
  }

  #matchRecord(): MatchRecord | null {
    if (!this.#engineMatch || !this.#round) return null
    return {
      roundNumber: this.#roundNumber,
      match: this.#engineMatch,
      round: this.#round,
      log: this.#log,
    }
  }

  #leaderboard(): { seat: number; name: string; total: number }[] {
    const totals = this.#engineMatch?.totals ?? []
    return this.#seats.map((seat, index) => ({
      seat: index,
      name: seat.name,
      total: totals[index] ?? 0,
    }))
  }

  #legal(seatIndex: number): LegalChoices | null {
    const round = this.#round
    if (!round || this.#status !== "playing" || round.toAct !== seatIndex) return null
    if (round.phase === "bidding") return { bids: legalBids(round), calls: null, plays: null }
    if (round.phase === "call") return { bids: null, calls: legalCalls(round), plays: null }
    if (round.phase === "play") return { bids: null, calls: null, plays: legalPlays(round) }
    return null
  }

  #playingSeat(connectionId: string): number | null {
    if (this.#status === "lobby" || !this.#round) {
      this.#quiet(connectionId, "The match has not started.")
      return null
    }
    if (this.#status === "finished") {
      this.#quiet(connectionId, "The match is over.")
      return null
    }
    if (this.#status === "paused") {
      this.#quiet(connectionId, "The match is paused.")
      return null
    }
    const seat = this.#seats.findIndex((item) => item.connectionId === connectionId && item.playerId)
    if (seat < 0) {
      this.#quiet(connectionId, "You are not seated.")
      return null
    }
    return seat
  }

  #hostOnly(connectionId: string): boolean {
    if (this.#isHost(connectionId)) return true
    this.#quiet(connectionId, "Only the host can do that")
    return false
  }

  #placeBid(connectionId: string, message: Extract<ClientMessage, { type: "place_bid" }>): void {
    const seat = this.#playingSeat(connectionId)
    if (seat === null) return
    this.#commit(connectionId, message, { type: "bid", seat, amount: message.amount })
  }

  #pass(connectionId: string, message: Extract<ClientMessage, { type: "pass" }>): void {
    const seat = this.#playingSeat(connectionId)
    if (seat === null) return
    this.#commit(connectionId, message, { type: "pass", seat })
  }

  #callCard(connectionId: string, message: Extract<ClientMessage, { type: "call_card" }>): void {
    const seat = this.#playingSeat(connectionId)
    if (seat === null) return
    this.#commit(connectionId, message, { type: "call", seat, card: { suit: message.suit, rank: message.rank } })
  }

  #playCard(connectionId: string, message: Extract<ClientMessage, { type: "play_card" }>): void {
    const seat = this.#playingSeat(connectionId)
    if (seat === null || !this.#round) return
    const built = playAction(this.#round, seat, {
      suit: message.suit,
      rank: message.rank,
      copy: message.deckIndex,
    })
    if ("error" in built) {
      this.#quiet(connectionId, built.error)
      return
    }
    this.#commit(connectionId, message, built.action)
  }

  #commit(connectionId: string, message: ClientMessage, action: Action): void {
    if (!this.#round || !this.#engineMatch) {
      this.#quiet(connectionId, "The match has not started.")
      return
    }
    const result = apply(this.#round, action)
    if (!result.ok) {
      this.#quiet(connectionId, result.error)
      return
    }
    this.#round = result.state
    this.#log.push({ kind: "action", action })
    this.#pushEvent(connectionId, message, "ok")
    if (result.state.phase === "redeal") {
      const dealt = dealRound({
        playerCount: result.state.playerCount,
        dealer: result.state.dealer,
        seed: this.#randomSeed(),
        roundNumber: this.#roundNumber,
      })
      this.#round = dealt.round
      this.#log.push(dealt.entry)
      this.#notify({ type: "redeal" })
      this.#broadcast()
      return
    }
    for (const event of result.events) {
      if (event.type !== "partnerRevealed") continue
      this.#notify({ type: "partner", seat: event.seat, trickNumber: event.trickNumber })
    }
    if (result.state.result && result.events.some((event) => event.type === "roundSettled")) {
      this.#engineMatch = recordRound(this.#engineMatch, result.state.result)
      if (this.#roundNumber >= this.#rounds) this.#status = "finished"
    }
    this.#broadcast()
  }

  #nextRound(connectionId: string, message: ClientMessage): void {
    if (!this.#hostOnly(connectionId)) return
    if (this.#status === "paused") {
      this.#quiet(connectionId, "The match is paused.")
      return
    }
    if (this.#status === "finished") {
      this.#quiet(connectionId, "The match is over.")
      return
    }
    if (this.#status !== "playing" || !this.#round) {
      this.#quiet(connectionId, "The match has not started.")
      return
    }
    if (this.#round.phase !== "scored") {
      this.#quiet(connectionId, "The round is not over.")
      return
    }
    const roundNumber = this.#roundNumber + 1
    const dealt = dealRound({
      playerCount: this.#round.playerCount,
      dealer: nextDealer(this.#round.dealer, this.#round.playerCount),
      seed: this.#randomSeed(),
      roundNumber,
    })
    this.#roundNumber = roundNumber
    this.#round = dealt.round
    this.#log.push(dealt.entry)
    this.#succeed(connectionId, message)
  }

  #pauseMatch(connectionId: string, message: ClientMessage): void {
    if (!this.#hostOnly(connectionId)) return
    if (this.#status !== "playing") {
      this.#quiet(connectionId, "The match is not in progress.")
      return
    }
    this.#status = "paused"
    this.#succeed(connectionId, message)
  }

  #resumeMatch(connectionId: string, message: ClientMessage): void {
    if (!this.#hostOnly(connectionId)) return
    if (this.#status !== "paused") {
      this.#quiet(connectionId, "The match is not paused.")
      return
    }
    this.#status = "playing"
    this.#succeed(connectionId, message)
  }

  #endMatch(connectionId: string, message: ClientMessage): void {
    if (!this.#hostOnly(connectionId)) return
    if (this.#status !== "playing" && this.#status !== "paused") {
      this.#quiet(
        connectionId,
        this.#status === "finished" ? "The match is over." : "The match has not started.",
      )
      return
    }
    this.#status = "finished"
    this.#succeed(connectionId, message)
  }

  #notify(message: TableNotice): void {
    for (const seat of this.#seats) {
      if (!seat.connectionId) continue
      this.#pushOut(seat.connectionId, message)
    }
  }

  #quiet(connectionId: string, error: string): void {
    this.#pushOut(connectionId, { type: "error", message: error })
  }

  #pushOut(connectionId: string, message: RoomView | ErrorMessage | TableNotice): void {
    const entry = { connectionId, message }
    this.#sent.push(entry)
    this.#pending.push(entry)
  }

  #now(): number {
    return this.#deps.now()
  }
}

function uniqueName(seats: SeatRecord[], requested: string): string {
  const taken = new Set(seats.map((seat) => seat.name))
  if (!taken.has(requested)) return requested
  let suffix = 2
  while (taken.has(`${requested} ${suffix}`)) suffix += 1
  return `${requested} ${suffix}`
}

function shuffleSeats(seats: SeatRecord[], randomInt: (exclusiveMax: number) => number): SeatRecord[] {
  const next = seats.slice()
  for (let index = next.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1)
    const current = next[index]
    next[index] = next[swap]!
    next[swap] = current!
  }
  return next
}

function loggedMessage(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { type: "rejected" }
  const source = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  if (typeof source.type === "string" && source.type.length <= 40) out.type = source.type
  if (typeof source.name === "string" && source.name.length <= 20 && !/\p{Cc}/u.test(source.name)) {
    out.name = source.name
  }
  if (typeof source.playerId === "string" && source.playerId.length <= 80 && !/\p{Cc}/u.test(source.playerId)) {
    out.playerId = source.playerId
  }
  for (const key of ["from", "to", "seat", "rounds", "reason"] as const) {
    const inner = source[key]
    if (typeof inner === "number" || (key === "reason" && typeof inner === "string" && inner.length <= 40)) {
      out[key] = inner
    }
  }
  return out
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}
