export const ROOM_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

export function randomRoomCode(): string {
  return randomCode(6)
}

export function randomClaimCode(length: number): string {
  return randomCode(length)
}

export function randomInt(exclusiveMax: number): number {
  if (!Number.isInteger(exclusiveMax) || exclusiveMax <= 0) {
    throw new Error("exclusiveMax must be a positive integer")
  }
  if (exclusiveMax === 1) return 0
  const limit = Math.floor(0x1_0000_0000 / exclusiveMax) * exclusiveMax
  const buffer = new Uint32Array(1)
  let value = 0
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0] ?? 0
  } while (value >= limit)
  return value % exclusiveMax
}

/** Tries codes until tryCreate reports that this attempt won. */
export async function allocateCode(
  tryCreate: (code: string) => Promise<boolean>,
  makeCode: () => string,
  maxAttempts = 8,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = makeCode()
    if (await tryCreate(code)) return code
  }
  throw new Error("Could not create a room")
}

function randomCode(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let code = ""
  for (const byte of bytes) code += ROOM_ALPHABET[byte % ROOM_ALPHABET.length]
  return code
}
