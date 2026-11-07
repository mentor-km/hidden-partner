import { describe, expect, it } from "vitest"
import { HAND_SIZE, POOL, TRICKS, buildDeck, cardPoints } from "../src/index.ts"
import { createRound } from "../src/server.ts"
import type { RoundState, Seed } from "../src/types.ts"
import { callFirst, electAtFloor, playOut } from "./helpers.ts"

function finish(playerCount: number): { dealt: RoundState; final: RoundState } {
  for (let n = 0; n < 30; n += 1) {
    const seed: Seed = [playerCount, n + 1, 3, 4]
    let state = createRound({ playerCount, dealer: 0, seed })
    const dealt = state
    state = electAtFloor(state, 1)
    if (state.phase !== "call") continue
    state = callFirst(state)
    const final = playOut(state).state
    return { dealt, final }
  }
  throw new Error(`No finished round for ${playerCount} players.`)
}

describe("invariants", () => {
  it.each([5, 6, 7, 8, 9])("holds the pool, the hand size and 12 tricks for %i players", (playerCount) => {
    expect(buildDeck(playerCount)).toHaveLength(playerCount * HAND_SIZE)
    const { dealt, final } = finish(playerCount)
    expect(dealt.hands.every((hand) => hand.length === HAND_SIZE)).toBe(true)
    expect(dealt.hands.flat().reduce((sum, card) => sum + cardPoints(card.rank), 0)).toBe(POOL)
    expect(final.tricks).toHaveLength(TRICKS)
    expect(final.hands.every((hand) => hand.length === 0)).toBe(true)
    expect(new Set(final.tricks[0]?.cards.map((play) => play.seat)).size).toBe(playerCount)
    const trickPoints = final.tricks.reduce((sum, trick) => sum + trick.points, 0)
    expect(trickPoints).toBe(POOL)
    expect(final.result?.teamPoints! + final.result?.othersPoints!).toBe(POOL)
    expect(final.phase).toBe("scored")
  })
})
