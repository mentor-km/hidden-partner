import { describe, expect, it } from "vitest"
import { HAND_SIZE, buildDeck, sortHand } from "../src/index.ts"
import { createRound, deal, sfc32, shuffle } from "../src/server.ts"
import type { Seed } from "../src/types.ts"
import { cardKey } from "./helpers.ts"

const SEED: Seed = [1, 2, 3, 4]

describe("seeded shuffle and deal", () => {
  it("uses a 128-bit sfc32 seed and repeats the same stream", () => {
    const first = sfc32(SEED)
    const second = sfc32(SEED)
    const stream = [first(), first(), first(), first()]
    expect(stream).toEqual([second(), second(), second(), second()])
    expect(stream[0]).toBe(7)
    expect(stream).not.toEqual([
      sfc32([1, 2, 3, 5])(),
      sfc32([1, 2, 3, 5])(),
      sfc32([1, 2, 3, 5])(),
      sfc32([1, 2, 3, 5])(),
    ])
  })

  it("rejects a seed that is not four integers", () => {
    expect(() => createRound({ playerCount: 5, dealer: 0, seed: [1] as unknown as Seed })).toThrow(/four integers/)
    expect(() => createRound({ playerCount: 5, dealer: 0, seed: [1, 2, 3, 1.5] })).toThrow(/four integers/)
  })

  it("deals the same hands for the same seed, dealer and player count", () => {
    const left = createRound({ playerCount: 6, dealer: 2, seed: SEED })
    const right = createRound({ playerCount: 6, dealer: 2, seed: SEED })
    expect(left.hands).toEqual(right.hands)
    expect(left.seed).toEqual(SEED)
    expect(shuffle(buildDeck(6), SEED)).toEqual(shuffle(buildDeck(6), SEED))
    expect(shuffle(buildDeck(6), SEED)).not.toEqual(shuffle(buildDeck(6), [1, 2, 3, 5]))
  })

  it("deals 12 sorted cards from a full deck, starting left of the dealer", () => {
    for (const playerCount of [5, 6, 7, 8, 9]) {
      const round = createRound({ playerCount, dealer: 0, seed: [9, 8, 7, 6] })
      expect(round.hands).toHaveLength(playerCount)
      for (const hand of round.hands) {
        expect(hand).toHaveLength(HAND_SIZE)
        expect(hand).toEqual(sortHand(hand))
      }
      const dealt = round.hands.flat().map(cardKey).sort()
      expect(dealt).toEqual(buildDeck(playerCount).map(cardKey).sort())
      expect(round.toAct).toBe(1)
    }
  })

  it("rotates the same shuffle when the dealer changes", () => {
    const seed: Seed = [4, 5, 6, 7]
    const deck = shuffle(buildDeck(5), seed)
    const atZero = createRound({ playerCount: 5, dealer: 0, seed })
    const atOne = createRound({ playerCount: 5, dealer: 1, seed })
    expect(atZero.hands).toEqual(deal(deck, 5, 0))
    expect(atOne.hands).toEqual(deal(deck, 5, 1))
    for (let seat = 0; seat < 5; seat += 1) {
      expect(atZero.hands[seat]).toEqual(atOne.hands[(seat + 1) % 5])
    }
  })
})
