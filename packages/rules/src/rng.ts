import type { Seed } from "./types.ts"

/** sfc32 from PractRand. Four uint32 words of state, 128 bits. */
export function sfc32(seed: Seed): () => number {
  let a = seed[0] | 0
  let b = seed[1] | 0
  let c = seed[2] | 0
  let d = seed[3] | 0
  return () => {
    a |= 0
    b |= 0
    c |= 0
    d |= 0
    const t = ((a + b) | 0) + d | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return t >>> 0
  }
}

export function uniformBelow(next: () => number, limit: number): number {
  if (limit <= 1) return 0
  const bound = Math.floor(4294967296 / limit) * limit
  let value = next()
  while (value >= bound) value = next()
  return value % limit
}
