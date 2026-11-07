import { ROOM_ALPHABET } from "../../server/src/codes.ts"

export function normalizeRoomCode(input: string): string {
  const trimmed = input.trim()
  const fromLink = trimmed.match(/\/r\/([a-zA-Z0-9-]+)/)
  const source = fromLink?.[1] ?? trimmed
  return source.replace(/[\s-]+/g, "").toUpperCase().slice(0, 6)
}

export function codeError(input: string): string | null {
  const code = normalizeRoomCode(input)
  if (code.length !== 6) return "Enter the 6-character room code"
  if ([...code].some((character) => !ROOM_ALPHABET.includes(character))) return "That code does not look right"
  return null
}

export function shareOrigin(configured: string | undefined, locationOrigin: string): string {
  const site = (configured ?? "").trim().replace(/\/$/, "")
  return site || locationOrigin
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/r/${code}`
}

export function whatsAppHref(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`You're invited to a Hidden Partner table ${url}`)}`
}
