import { describe, expect, it } from "vitest"
import { allocateCode, ROOM_ALPHABET, randomRoomCode } from "../src/codes.ts"
import { config } from "../src/config.ts"
import { Lobby, connectionError } from "../src/lobby.ts"
import type { LobbyDeps, RoomView } from "../src/lobby.ts"
import { parseClientMessage, parseCreateBody } from "../src/messages.ts"

const SECRET = "raw-secret-do-not-store"
const PIN = "7394"

const PUBLIC_KEYS = new Set([
  "type",
  "code",
  "status",
  "rounds",
  "hostSeat",
  "you",
  "seats",
  "seat",
  "name",
  "connected",
  "claimCodes",
  "message",
])

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
  const codes = ["HJKLMN", "NPQRST", "UVWXYZ", "ABCDEF"]
  let index = 0
  return {
    now,
    randomInt: overrides?.randomInt ?? (() => 0),
    randomCode: overrides?.randomCode ?? (() => codes[index++] ?? "HJKLMN"),
    config: overrides?.config,
  }
}

async function createLobby(options?: {
  now?: () => number
  config?: LobbyDeps["config"]
  randomInt?: (exclusiveMax: number) => number
  secret?: string
  name?: string
}) {
  const time = options?.now ?? (() => 1_700_000_000_000)
  const secret = options?.secret ?? SECRET
  const lobby = Lobby.create(
    {
      code: "K7NQ2A",
      name: options?.name ?? "Ava",
      playerId: "player-host",
      secretHash: await sha256Hex(secret),
    },
    deps(time, { config: options?.config, randomInt: options?.randomInt }),
  )
  return { lobby, secret }
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

function hostName(lobby: Lobby): string {
  const room = lobby.record()
  const seat = room.seats.find((item) => item.id === room.hostSeatId)
  if (!seat) throw new Error("missing host")
  return seat.name
}

async function join(
  lobby: Lobby,
  connectionId: string,
  input: { playerId: string; secret: string; name: string; pin?: string; claimCode?: string },
) {
  await send(lobby, connectionId, { type: "join", ...input })
}

async function claimHost(lobby: Lobby, secret = SECRET, pin?: string) {
  await join(lobby, "c-host", { playerId: "player-host", secret, name: "Ava", pin })
}

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

async function addGuests(lobby: Lobby, count: number) {
  for (let index = 0; index < count; index++) {
    const guest = GUESTS[index]
    if (!guest) throw new Error("not enough guest names")
    await join(lobby, `c-${guest[1]}`, {
      playerId: guest[1],
      secret: `secret-${guest[1]}`,
      name: guest[0],
    })
  }
}

describe("config", () => {
  it("keeps the room timers and the PIN lockout in one file", () => {
    expect(config.hostHandoverMs).toBe(2 * 60 * 1000)
    expect(config.lobbyExpiryMs).toBe(24 * 60 * 60 * 1000)
    expect(config.matchRetentionMs).toBe(30 * 24 * 60 * 60 * 1000)
    expect(config.pinMaxAttempts).toBe(5)
    expect(config.pinLockoutMs).toBe(5 * 60 * 1000)
  })
})

describe("room codes", () => {
  it("uses a 6 character alphabet without look-alike characters", () => {
    expect(ROOM_ALPHABET).toBe("23456789ABCDEFGHJKLMNPQRSTUVWXYZ")
    expect(ROOM_ALPHABET).not.toMatch(/[01IO]/)
    for (let index = 0; index < 30; index++) {
      expect(randomRoomCode()).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/)
    }
  })

  it("retries when a code is already taken", async () => {
    const tried: string[] = []
    const code = await allocateCode(async (candidate) => {
      tried.push(candidate)
      return candidate === "CCCCCC"
    }, (() => {
      const codes = ["AAAAAA", "BBBBBB", "CCCCCC"]
      return () => codes.shift() ?? "DDDDDD"
    })())
    expect(tried).toEqual(["AAAAAA", "BBBBBB", "CCCCCC"])
    expect(code).toBe("CCCCCC")
  })

  it("fails clearly when every attempt collides", async () => {
    await expect(allocateCode(async () => false, () => "AAAAAA", 3)).rejects.toThrow("Could not create a room")
  })
})

describe("create", () => {
  it("seats the creator as host, and the first join claims that seat", async () => {
    const { lobby, secret } = await createLobby()
    const before = lobby.record()
    expect(before.status).toBe("lobby")
    expect(before.rounds).toBe(5)
    expect(before.seats).toHaveLength(1)
    expect(before.seats[0]).toMatchObject({ name: "Ava", playerId: "player-host", connected: false })
    expect(before.hostSeatId).toBe(before.seats[0]?.id)
    expect(before.seats[0]?.secretHash).toBe(await sha256Hex(secret))

    await claimHost(lobby, secret)
    const after = lobby.record()
    expect(after.seats).toHaveLength(1)
    expect(after.seats[0]).toMatchObject({ name: "Ava", connected: true, playerId: "player-host" })
    expect(lastView(lobby, "c-host").you).toEqual({ seat: 0, name: "Ava" })
    expect(lastView(lobby, "c-host").hostSeat).toBe(0)
  })

  it("rejects a create body that is not a secret hash", async () => {
    const parsed = parseCreateBody({
      name: "Ava",
      playerId: "player-host",
      secretHash: SECRET,
    })
    expect(parsed.ok).toBe(false)
    expect(() =>
      Lobby.create(
        { code: "K7NQ2A", name: "Ava", playerId: "player-host", secretHash: SECRET },
        deps(() => 0),
      ),
    ).toThrow()
  })

  it("trims the creator's name", () => {
    return sha256Hex("host-secret").then((secretHash) => {
      const parsed = parseCreateBody({ name: "  Ava  ", playerId: "player-host", secretHash })
      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(parsed.data.name).toBe("Ava")
    })
  })
})

describe("lobby play", () => {
  it("lets five players join and the host start, then locks the table", async () => {
    const { lobby } = await createLobby()
    await claimHost(lobby)
    await addGuests(lobby, 3)
    await send(lobby, "c-player-ben", { type: "start_match" })
    expect(lastError(lobby, "c-player-ben")).toBe("Only the host can do that")

    await send(lobby, "c-host", { type: "start_match" })
    expect(lastError(lobby, "c-host")).toBe("Need between 5 and 9 players to start")

    await send(lobby, "c-host", { type: "set_rounds", rounds: 7 })
    await addGuests(lobby, 4)
    await send(lobby, "c-host", { type: "start_match" })

    const view = lastView(lobby, "c-host")
    expect(view.status).toBe("playing")
    expect(view.rounds).toBe(7)
    expect(view.seats.map((seat) => seat.seat)).toEqual([0, 1, 2, 3, 4])
    expect(view.you.seat).toBe(view.hostSeat)
    expect(view.seats.map((seat) => seat.name).sort()).toEqual(["Ava", "Ben", "Cleo", "Drew", "Eden"])
    expect(lobby.record()).toMatchObject({ status: "playing", roundsLocked: true, playersLocked: true, rounds: 7 })

    await send(lobby, "c-host", { type: "set_rounds", rounds: 3 })
    expect(lastError(lobby, "c-host")).toBe("Rounds are locked")
    await send(lobby, "c-host", { type: "move_seat", from: 0, to: 1 })
    expect(lastError(lobby, "c-host")).toBe("Only available in the lobby")
    await send(lobby, "c-host", { type: "remove_player", seat: 1 })
    expect(lastError(lobby, "c-host")).toBe("Only available in the lobby")
    await join(lobby, "c-late", { playerId: "player-late", secret: "late-secret", name: "Jin" })
    expect(lastError(lobby, "c-late")).toBe("The match has already started")
    expect(lobby.record().seats).toHaveLength(5)
  })

  it("refuses a 10th person with Room full when 9 are seated", async () => {
    const { lobby } = await createLobby()
    await claimHost(lobby)
    await addGuests(lobby, 8)
    expect(lobby.record().seats).toHaveLength(9)

    await join(lobby, "c-jin", { playerId: "player-jin", secret: "jin-secret", name: "Jin" })
    expect(lastError(lobby, "c-jin")).toBe("Room full")
    expect(lobby.record().seats).toHaveLength(9)
    expect(lobby.record().seats.some((seat) => seat.name === "Jin")).toBe(false)

    lobby.close("c-player-ben")
    await join(lobby, "c-ben-2", { playerId: "player-ben", secret: "secret-player-ben", name: "Ben" })
    expect(lobby.record().seats).toHaveLength(9)
    expect(lastView(lobby, "c-ben-2").you.name).toBe("Ben")
  })

  it("adds a number when a display name is already taken", async () => {
    const { lobby } = await createLobby({ name: "Sam" })
    await join(lobby, "c-host", { playerId: "player-host", secret: SECRET, name: "Sam" })
    await join(lobby, "c-2", { playerId: "player-2", secret: "secret-two", name: "Sam" })
    await join(lobby, "c-3", { playerId: "player-3", secret: "secret-three", name: "Sam" })
    expect(lobby.record().seats.map((seat) => seat.name)).toEqual(["Sam", "Sam 2", "Sam 3"])
  })
})

describe("identity", () => {
  it("rejoins the same seat with the same player id and secret", async () => {
    const { lobby, secret } = await createLobby()
    await claimHost(lobby, secret)
    await addGuests(lobby, 1)
    lobby.close("c-player-ben")
    expect(lobby.record().seats[1]).toMatchObject({ connected: false })

    await join(lobby, "c-ben-again", {
      playerId: "player-ben",
      secret: "secret-player-ben",
      name: "Someone else",
    })
    expect(lobby.record().seats).toHaveLength(2)
    expect(lobby.record().seats[1]).toMatchObject({
      name: "Ben",
      playerId: "player-ben",
      connected: true,
      connectionId: "c-ben-again",
    })
    expect(lastView(lobby, "c-ben-again").you).toEqual({ seat: 1, name: "Ben" })
  })

  it("refuses a wrong secret and leaves the seat unchanged", async () => {
    const { lobby } = await createLobby()
    await claimHost(lobby)
    lobby.close("c-host")
    const before = lobby.record()

    await join(lobby, "c-thief", { playerId: "player-host", secret: "wrong-secret-value", name: "Ava" })
    expect(lastError(lobby, "c-thief")).toBe("Wrong secret")
    expect(lobby.record().seats).toEqual(before.seats)
    expect(lobby.record().hostSeatId).toBe(before.hostSeatId)
  })

  it("replaces a seat from a new device when the name and PIN match", async () => {
    const { lobby } = await createLobby()
    await claimHost(lobby, SECRET, PIN)
    lobby.close("c-host")

    await join(lobby, "c-new", {
      playerId: "player-new",
      secret: "replacement-secret",
      name: "Ava",
      pin: PIN,
    })
    expect(lobby.record().seats[0]).toMatchObject({
      playerId: "player-new",
      connected: true,
      name: "Ava",
    })
    expect(lobby.record().seats[0]?.secretHash).toBe(await sha256Hex("replacement-secret"))

    await join(lobby, "c-old", { playerId: "player-host", secret: SECRET, name: "Ava" })
    expect(lobby.record().seats[0]?.playerId).toBe("player-new")
    expect(lobby.record().seats[1]?.name).toBe("Ava 2")
    await join(lobby, "c-new-2", { playerId: "player-new", secret: "replacement-secret", name: "Ava" })
    expect(lastView(lobby, "c-new-2").you).toEqual({ seat: 0, name: "Ava" })
  })
})

describe("host handover", () => {
  it("does not replace a host who has never connected", async () => {
    const time = clock(0)
    const { lobby } = await createLobby({
      now: time.now,
      config: { hostHandoverMs: 1_000, lobbyExpiryMs: 60_000 },
    })
    time.set(10_000)
    lobby.alarm()
    expect(hostName(lobby)).toBe("Ava")
    expect(lobby.record().status).toBe("lobby")
  })

  it("passes the host to the longest-seated connected player after the timer", async () => {
    const time = clock(0)
    const { lobby } = await createLobby({
      now: time.now,
      config: { hostHandoverMs: 1_000, lobbyExpiryMs: 60_000 },
    })
    time.set(10)
    await claimHost(lobby)
    time.set(20)
    await addGuests(lobby, 1)
    time.set(30)
    await addGuests(lobby, 2)
    time.set(40)
    lobby.close("c-host")
    lobby.alarm()
    expect(hostName(lobby)).toBe("Ava")

    time.set(1_040)
    lobby.alarm()
    expect(hostName(lobby)).toBe("Ben")
    expect(lastView(lobby, "c-player-ben").hostSeat).toBe(1)
    expect(lastView(lobby, "c-player-cleo").hostSeat).toBe(1)
  })

  it("skips an offline player and keeps the host if nobody else is connected", async () => {
    const time = clock(0)
    const { lobby } = await createLobby({
      now: time.now,
      config: { hostHandoverMs: 1_000, lobbyExpiryMs: 60_000 },
    })
    time.set(10)
    await claimHost(lobby)
    time.set(20)
    await addGuests(lobby, 2)
    time.set(40)
    lobby.close("c-host")
    lobby.close("c-player-ben")
    time.set(1_040)
    lobby.alarm()
    expect(hostName(lobby)).toBe("Cleo")

    const alone = clock(0)
    const second = await createLobby({
      now: alone.now,
      config: { hostHandoverMs: 1_000, lobbyExpiryMs: 60_000 },
    })
    alone.set(10)
    await claimHost(second.lobby)
    alone.set(20)
    second.lobby.close("c-host")
    alone.set(2_000)
    second.lobby.alarm()
    expect(hostName(second.lobby)).toBe("Ava")
    expect(second.lobby.record().hostDisconnectedAt).toBe(20)
  })

  it("cancels handover when the host reconnects in time", async () => {
    const time = clock(0)
    const { lobby, secret } = await createLobby({
      now: time.now,
      config: { hostHandoverMs: 1_000, lobbyExpiryMs: 60_000 },
    })
    time.set(10)
    await claimHost(lobby, secret)
    time.set(20)
    await addGuests(lobby, 1)
    time.set(30)
    lobby.close("c-host")
    time.set(40)
    await join(lobby, "c-host-2", { playerId: "player-host", secret, name: "Ava" })
    time.set(5_000)
    lobby.alarm()
    expect(hostName(lobby)).toBe("Ava")
  })
})

describe("privacy", () => {
  it("never stores the raw secret or PIN and never sends them or their hashes", async () => {
    const time = clock(0)
    const { lobby } = await createLobby({ now: time.now })
    await claimHost(lobby, SECRET, PIN)
    await join(lobby, "c-thief", { playerId: "player-host", secret: SECRET, name: "Ava" })
    lobby.close("c-host")
    await join(lobby, "c-wrong-pin", {
      playerId: "player-other",
      secret: SECRET,
      name: "Ava",
      pin: "0000",
    })
    await lobby.handle("c-huge", `{"type":"join","secret":"${SECRET}","pin":"${PIN}","name":"${"x".repeat(80)}"}`)

    const stored = JSON.stringify({ room: lobby.record(), events: lobby.events() })
    const outbound = JSON.stringify(lobby.messages())
    expect(stored).not.toContain(SECRET)
    expect(outbound).not.toContain(SECRET)
    expect(stored).not.toContain(`"${PIN}"`)
    expect(outbound).not.toContain(PIN)
    expect(outbound).not.toContain(await sha256Hex(SECRET))
    expect(outbound).not.toContain(await sha256Hex(PIN))

    const storedKeys = keysOf(lobby.record())
    expect(storedKeys.has("secret")).toBe(false)
    expect(storedKeys.has("pin")).toBe(false)
    expect(storedKeys.has("secretHash")).toBe(true)
    expect(storedKeys.has("pinHash")).toBe(true)

    for (const entry of lobby.messages()) assertPublic(entry.message)
    for (const event of lobby.events()) {
      expect(JSON.stringify(event)).not.toContain(SECRET)
      expect(JSON.stringify(event)).not.toContain(`"${PIN}"`)
    }
  })
})

describe("seats", () => {
  it("shuffles seat order at start unless the host rearranged it", async () => {
    const shuffled = await createLobby()
    await claimHost(shuffled.lobby)
    await addGuests(shuffled.lobby, 4)
    await send(shuffled.lobby, "c-host", { type: "start_match" })
    expect(shuffled.lobby.record().seats.map((seat) => seat.name)).toEqual([
      "Ben",
      "Cleo",
      "Drew",
      "Eden",
      "Ava",
    ])
    expect(shuffled.lobby.record().seats.map((_, index) => index)).toEqual([0, 1, 2, 3, 4])
    expect(lastView(shuffled.lobby, "c-host").hostSeat).toBe(4)

    const arranged = await createLobby()
    await claimHost(arranged.lobby)
    await addGuests(arranged.lobby, 4)
    await send(arranged.lobby, "c-host", { type: "move_seat", from: 4, to: 0 })
    expect(arranged.lobby.record().rearranged).toBe(true)
    expect(arranged.lobby.record().seats.map((seat) => seat.name)).toEqual([
      "Eden",
      "Ava",
      "Ben",
      "Cleo",
      "Drew",
    ])
    await send(arranged.lobby, "c-host", { type: "start_match" })
    expect(arranged.lobby.record().seats.map((seat) => seat.name)).toEqual([
      "Eden",
      "Ava",
      "Ben",
      "Cleo",
      "Drew",
    ])
    expect(lastView(arranged.lobby, "c-host").seats.map((seat) => seat.seat)).toEqual([0, 1, 2, 3, 4])
  })

  it("lets the host remove a guest in the lobby and refuses removing the host", async () => {
    const { lobby } = await createLobby()
    await claimHost(lobby)
    await addGuests(lobby, 2)
    await send(lobby, "c-host", { type: "remove_player", seat: 0 })
    expect(lastError(lobby, "c-host")).toBe("You cannot remove the host")
    await send(lobby, "c-host", { type: "remove_player", seat: 1 })
    expect(lobby.record().seats.map((seat) => seat.name)).toEqual(["Ava", "Cleo"])
    expect(lastError(lobby, "c-player-ben")).toBe("The host removed you from the room")
  })
})

describe("PIN lockout", () => {
  it("locks a seat for the configured time after 5 wrong PINs", async () => {
    const time = clock(0)
    const { lobby } = await createLobby({ now: time.now })
    await claimHost(lobby, SECRET, PIN)
    lobby.close("c-host")

    for (let attempt = 0; attempt < 4; attempt++) {
      await join(lobby, `c-bad-${attempt}`, {
        playerId: `player-bad-${attempt}`,
        secret: `bad-secret-${attempt}`,
        name: "Ava",
        pin: "0000",
      })
      expect(lastError(lobby, `c-bad-${attempt}`)).toBe("Wrong PIN")
    }

    await join(lobby, "c-bad-4", {
      playerId: "player-bad-4",
      secret: "bad-secret-4",
      name: "Ava",
      pin: "0000",
    })
    expect(lastError(lobby, "c-bad-4")).toBe("This seat is locked")

    await join(lobby, "c-good-early", {
      playerId: "player-new",
      secret: "replacement-secret",
      name: "Ava",
      pin: PIN,
    })
    expect(lastError(lobby, "c-good-early")).toBe("This seat is locked")
    expect(lobby.record().seats[0]?.playerId).toBe("player-host")

    time.advance(config.pinLockoutMs)
    await join(lobby, "c-good", {
      playerId: "player-new",
      secret: "replacement-secret",
      name: "Ava",
      pin: PIN,
    })
    expect(lastView(lobby, "c-good").you).toEqual({ seat: 0, name: "Ava" })
    expect(lobby.record().seats[0]?.playerId).toBe("player-new")
  })
})

describe("release", () => {
  it("frees the seat in the lobby", async () => {
    const { lobby } = await createLobby()
    await claimHost(lobby)
    await addGuests(lobby, 1)
    await send(lobby, "c-host", { type: "release_seat", seat: 0 })
    expect(lastError(lobby, "c-host")).toBe("You cannot release the host")
    await send(lobby, "c-host", { type: "release_seat", seat: 1 })
    expect(lobby.record().seats.map((seat) => seat.name)).toEqual(["Ava"])
    expect(lastError(lobby, "c-player-ben")).toBe("The host released your seat")

    await join(lobby, "c-ben-2", { playerId: "player-ben-2", secret: "another-secret", name: "Ben" })
    expect(lobby.record().seats.map((seat) => seat.name)).toEqual(["Ava", "Ben"])
  })

  it("gives only the host a one-time claim code once the match has started", async () => {
    const { lobby } = await createLobby()
    await claimHost(lobby)
    await addGuests(lobby, 4)
    await send(lobby, "c-host", { type: "start_match" })
    const benBefore = lobby.record().seats.find((seat) => seat.name === "Ben")
    await send(lobby, "c-host", { type: "release_seat", seat: 0 })

    const hostView = lastView(lobby, "c-host")
    expect(hostView.claimCodes).toEqual([{ seat: 0, code: "HJKLMN" }])
    expect(lobby.record().seats[0]).toMatchObject({ name: "Ben", playerId: null, connected: false })
    expect(lobby.record().seats).toHaveLength(5)

    for (const entry of lobby.messages()) {
      if (entry.connectionId === "c-host") continue
      expect(JSON.stringify(entry.message)).not.toContain("HJKLMN")
    }

    await join(lobby, "c-old-ben", {
      playerId: "player-ben",
      secret: "secret-player-ben",
      name: "Ben",
    })
    expect(lastError(lobby, "c-old-ben")).toBe("The match has already started")

    await join(lobby, "c-claim", {
      playerId: "player-claim",
      secret: "claimed-secret",
      name: "Ben",
      claimCode: "HJKLMN",
    })
    expect(lastView(lobby, "c-claim").you).toEqual({ seat: 0, name: "Ben" })
    expect(lobby.record().seats[0]?.playerId).toBe("player-claim")
    expect(lobby.record().seats[0]?.secretHash).toBe(await sha256Hex("claimed-secret"))
    expect(JSON.stringify(lastView(lobby, "c-host"))).not.toContain("HJKLMN")

    await join(lobby, "c-again", {
      playerId: "player-again",
      secret: "another-claimed-secret",
      name: "Ben",
      claimCode: "HJKLMN",
    })
    expect(lastError(lobby, "c-again")).toBe("That name and code do not match a released seat")
    expect(benBefore?.playerId).toBe("player-ben")
  })
})

describe("messages", () => {
  it("trims names, limits them to 20 characters, and rejects control characters", async () => {
    const parsed = parseClientMessage({
      type: "join",
      playerId: "player-ned",
      secret: "ned-secret",
      name: "  Ned  ",
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok && parsed.data.type === "join") expect(parsed.data.name).toBe("Ned")

    const tooLong = parseClientMessage({
      type: "join",
      playerId: "player-ned",
      secret: "ned-secret",
      name: "N".repeat(21),
    })
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) expect(tooLong.message).toBe("Name must be 1 to 20 characters")

    const control = parseClientMessage({
      type: "join",
      playerId: "player-ned",
      secret: "ned-secret",
      name: "Ned\u0001",
    })
    expect(control.ok).toBe(false)
    if (!control.ok) expect(control.message).toBe("Name cannot contain control characters")

    const { lobby } = await createLobby()
    await claimHost(lobby)
    await join(lobby, "c-ned", { playerId: "player-ned", secret: "ned-secret", name: "  Ned  " })
    expect(lobby.record().seats.map((seat) => seat.name)).toEqual(["Ava", "Ned"])
    await join(lobby, "c-bad", { playerId: "player-bad", secret: "bad-secret", name: "Ned\u0001" })
    expect(lastError(lobby, "c-bad")).toBe("Name cannot contain control characters")
    expect(lobby.record().seats).toHaveLength(2)
  })

  it("rejects rounds outside 1 to 99 and messages over the size limit", async () => {
    const { lobby } = await createLobby()
    await claimHost(lobby)
    await send(lobby, "c-host", { type: "set_rounds", rounds: 0 })
    expect(lastError(lobby, "c-host")).toBe("Rounds must be a whole number from 1 to 99")
    await send(lobby, "c-host", { type: "set_rounds", rounds: 100 })
    expect(lastError(lobby, "c-host")).toBe("Rounds must be a whole number from 1 to 99")
    await send(lobby, "c-host", { type: "set_rounds", rounds: 3 })
    expect(lastView(lobby, "c-host").rounds).toBe(3)

    const before = lobby.record()
    await lobby.handle("c-host", "x".repeat(config.maxMessageBytes + 1))
    expect(lastError(lobby, "c-host")).toBe("Message too large")
    expect(lobby.record().rounds).toBe(before.rounds)
  })

  it("appends every client message to the event log", async () => {
    const { lobby } = await createLobby()
    await claimHost(lobby)
    await send(lobby, "c-host", { type: "set_rounds", rounds: 3 })
    await join(lobby, "c-thief", { playerId: "player-host", secret: "nope-secret", name: "Ava" })
    const ids = lobby.events().map((event) => event.id)
    expect(ids).toEqual([1, 2, 3])
    expect(lobby.events().map((event) => event.result)).toEqual(["ok", "ok", "error"])
  })
})

describe("saving and expiry", () => {
  it("restores the room and continues the event log", async () => {
    const time = clock(50)
    const { lobby, secret } = await createLobby({ now: time.now })
    await claimHost(lobby, secret, PIN)
    await addGuests(lobby, 1)
    const saved = lobby.record()
    const restored = Lobby.restore(saved, deps(time.now))
    expect(restored.record()).toEqual(saved)

    restored.reconcile(new Set())
    expect(restored.record().seats.every((seat) => seat.connected === false)).toBe(true)
    expect(restored.record().hostDisconnectedAt).toBe(50)

    await join(restored, "c-again", { playerId: "player-host", secret, name: "Ava" })
    expect(restored.record().seats[0]).toMatchObject({ connected: true, playerId: "player-host" })
    expect(restored.events().at(-1)?.id).toBe(saved.nextEventId)
  })

  it("expires an unused lobby and a retained match on the alarm", async () => {
    const time = clock(0)
    const { lobby } = await createLobby({
      now: time.now,
      config: { lobbyExpiryMs: 1_000, matchRetentionMs: 5_000, hostHandoverMs: 60_000 },
    })
    time.set(1_000)
    lobby.alarm()
    expect(lobby.record().status).toBe("expired")
    expect(connectionError(null)).toBe("Room not found")
    expect(connectionError(lobby.record())).toBe("This room has expired")
    await claimHost(lobby)
    expect(lastError(lobby, "c-host")).toBe("This room has expired")

    const playing = clock(0)
    const started = await createLobby({
      now: playing.now,
      config: { lobbyExpiryMs: 1_000, matchRetentionMs: 5_000, hostHandoverMs: 60_000 },
    })
    await claimHost(started.lobby)
    await addGuests(started.lobby, 4)
    await send(started.lobby, "c-host", { type: "start_match" })
    playing.set(1_000)
    started.lobby.alarm()
    expect(started.lobby.record().status).toBe("playing")
    playing.set(5_000)
    started.lobby.alarm()
    expect(started.lobby.record().status).toBe("expired")
    expect(lastError(started.lobby, "c-host")).toBe("This room has expired")
  })
})

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

function assertPublic(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertPublic(item)
    return
  }
  if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      expect(PUBLIC_KEYS.has(key)).toBe(true)
      assertPublic(inner)
    }
  }
}
