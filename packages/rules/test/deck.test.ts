import { describe, expect, it } from "vitest"
import { BID_CAP, BID_FLOORS, HAND_SIZE, POOL, RANKS, SUITS, TRICKS, bidFloor, buildDeck, cardPoints } from "../src/index.ts"
import type { Rank } from "../src/types.ts"

const DECKS: { players: number; cards: number; low: Rank }[] = [
  { players: 5, cards: 60, low: "10" },
  { players: 6, cards: 72, low: "9" },
  { players: 7, cards: 84, low: "8" },
  { players: 8, cards: 96, low: "7" },
  { players: 9, cards: 108, low: "6" },
]

describe("deck", () => {
  it("uses the fixed pool, hand size, floor and cap", () => {
    expect(POOL).toBe(2520)
    expect(HAND_SIZE).toBe(12)
    expect(TRICKS).toBe(12)
    expect(BID_CAP).toBe(2520)
    for (const players of [5, 6, 7, 8, 9] as const) {
      expect(BID_FLOORS[players]).toBe(1260)
      expect(bidFloor(players)).toBe(1260)
    }
  })

  it.each(DECKS)("$players players use $cards cards and the low rank $low", ({ players, cards, low }) => {
    const deck = buildDeck(players)
    expect(deck).toHaveLength(cards)
    expect(deck.reduce((sum, card) => sum + cardPoints(card.rank), 0)).toBe(2520)
    const included = RANKS.slice(0, players)
    expect(included[included.length - 1]).toBe(low)
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const copies = deck.filter((card) => card.suit === suit && card.rank === rank).length
        expect(copies).toBe(included.includes(rank) ? 3 : 0)
      }
    }
    expect(deck.filter((card) => card.rank === "A")).toHaveLength(12)
    expect(deck.filter((card) => card.rank === "K").length * 50).toBe(600)
    expect(deck.filter((card) => card.rank === "Q").length * 30).toBe(360)
    expect(deck.filter((card) => card.rank === "J").length * 20).toBe(240)
    expect(deck.filter((card) => card.rank === "10").length * 10).toBe(120)
  })

  it("rejects a player count outside 5 to 9", () => {
    expect(() => buildDeck(4)).toThrow()
    expect(() => buildDeck(10)).toThrow()
  })

  it("scores 9 and lower as zero", () => {
    expect(cardPoints("9")).toBe(0)
    expect(cardPoints("8")).toBe(0)
    expect(cardPoints("7")).toBe(0)
    expect(cardPoints("6")).toBe(0)
    expect(cardPoints("A")).toBe(100)
    expect(cardPoints("K")).toBe(50)
    expect(cardPoints("Q")).toBe(30)
    expect(cardPoints("J")).toBe(20)
    expect(cardPoints("10")).toBe(10)
  })
})
