const PLAYER_ID = "hp.playerId"
const SECRET = "hp.secret"
const LAST_NAME = "hp.lastName"
const ROOMS = "hp.rooms"
const roundsKey = (code: string) => `hp.rounds.${code}`

type SavedRooms = Record<string, { name: string }>

const staged = new Map<string, { name: string; pin: string }>()

export function loadIdentity(): { playerId: string; secret: string } {
  const existingId = localStorage.getItem(PLAYER_ID)
  const existingSecret = localStorage.getItem(SECRET)
  if (existingId && existingSecret) return { playerId: existingId, secret: existingSecret }
  const playerId = crypto.randomUUID()
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const secret = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
  localStorage.setItem(PLAYER_ID, playerId)
  localStorage.setItem(SECRET, secret)
  return { playerId, secret }
}

export function loadLastName(): string {
  return localStorage.getItem(LAST_NAME) ?? ""
}

export function rememberName(name: string): void {
  localStorage.setItem(LAST_NAME, name)
}

export function rememberedRoom(code: string): { name: string } | null {
  const rooms = readRooms()
  return rooms[code] ?? null
}

export function rememberRoom(code: string, name: string): void {
  const rooms = readRooms()
  rooms[code] = { name }
  localStorage.setItem(ROOMS, JSON.stringify(rooms))
}

export function forgetRoom(code: string): void {
  const rooms = readRooms()
  delete rooms[code]
  localStorage.setItem(ROOMS, JSON.stringify(rooms))
}

export function stageJoin(code: string, join: { name: string; pin: string }): void {
  staged.set(code, join)
}

export function stagedJoin(code: string): { name: string; pin: string } | null {
  return staged.get(code) ?? null
}

export function clearStagedJoin(code: string): void {
  staged.delete(code)
}

export function rememberRounds(code: string, rounds: number): void {
  sessionStorage.setItem(roundsKey(code), String(rounds))
}

export function desiredRounds(code: string): number | undefined {
  const raw = sessionStorage.getItem(roundsKey(code))
  if (!raw) return undefined
  const rounds = Number(raw)
  return Number.isInteger(rounds) ? rounds : undefined
}

export function forgetRounds(code: string): void {
  sessionStorage.removeItem(roundsKey(code))
}

function readRooms(): SavedRooms {
  const raw = localStorage.getItem(ROOMS)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const rooms: SavedRooms = {}
    for (const [code, value] of Object.entries(parsed)) {
      if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
        rooms[code] = { name: value.name }
      }
    }
    return rooms
  } catch {
    return {}
  }
}
