import { describe, expect, it } from "vitest"
import { viewFor } from "../src/index.ts"
import { createRound } from "../src/server.ts"
import type { Card, RoundState, Seed } from "../src/types.ts"
import { callFirst, electAtFloor, playOut } from "./helpers.ts"

const SEED: Seed = [111, 222, 333, 444]

function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, found)
    return found
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.add(key)
      keysOf(child, found)
    }
  }
  return found
}

function containsSeed(value: unknown, seed: readonly number[]): boolean {
  if (Array.isArray(value) && value.length === seed.length && value.every((item, index) => item === seed[index])) {
    return true
  }
  if (Array.isArray(value)) return value.some((item) => containsSeed(item, seed))
  if (value && typeof value === "object") return Object.values(value).some((item) => containsSeed(item, seed))
  return false
}

function isCard(value: unknown): value is Card {
  return !!value && typeof value === "object" && "suit" in value && "rank" in value && "copy" in value
}

function cardArrays(value: unknown, out: Card[][] = []): Card[][] {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isCard)) out.push(value)
    for (const item of value) cardArrays(item, out)
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) cardArrays(child, out)
  }
  return out
}

function expectPrivate(state: RoundState, scored: boolean) {
  for (let seat = 0; seat < state.playerCount; seat += 1) {
    const view = viewFor(state, seat)
    expect(view.hand).toEqual(state.hands[seat])
    expect(view.seat).toBe(seat)
    expect(containsSeed(view, state.seed)).toBe(false)
    expect(keysOf(view).has("seed")).toBe(false)
    expect(keysOf(view).has("hands")).toBe(false)
    if (!scored) {
      expect(view.result).toBeNull()
      expect(keysOf(view).has("partners")).toBe(false)
      expect(keysOf(view).has("copiesHeld")).toBe(false)
      for (let other = 0; other < state.playerCount; other += 1) {
        if (other === seat) continue
        for (const cards of cardArrays(view)) expect(cards).not.toEqual(state.hands[other])
      }
    } else {
      const { result, ...rest } = view
      expect(result?.partners).toEqual(state.partners)
      expect(keysOf(rest).has("partners")).toBe(false)
      expect(keysOf(rest).has("copiesHeld")).toBe(false)
    }
  }
}

function untilCall(): RoundState {
  for (let n = 0; n < 30; n += 1) {
    let state = createRound({ playerCount: 5, dealer: 0, seed: [SEED[0], SEED[1], SEED[2], n + 1] })
    state = electAtFloor(state, 1)
    if (state.phase === "call") return state
  }
  throw new Error("Could not reach a call.")
}

describe("seat view", () => {
  it("hides the seed, the other hands and the secret partners during the round", () => {
    const dealt = createRound({ playerCount: 5, dealer: 0, seed: SEED })
    expectPrivate(dealt, false)

    const calling = untilCall()
    const called = callFirst(calling)
    expect(called.partners && called.partners.length > 0).toBe(true)
    expectPrivate(called, false)
    for (let seat = 0; seat < called.playerCount; seat += 1) {
      expect(viewFor(called, seat).revealedPartners).toEqual([])
    }
  })

  it("names the partners in the round result and still hides the seed", () => {
    let state = untilCall()
    state = callFirst(state)
    const finished = playOut(state).state
    expect(finished.phase).toBe("scored")
    expectPrivate(finished, true)
    expect(viewFor(finished, 0).result?.bidder).toBe(finished.bidder)
    expect(viewFor(finished, 2).hand).toEqual([])
  })
})
