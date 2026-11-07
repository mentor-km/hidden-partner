import { describe, expect, it } from "vitest"
import { apply, legalBids, legalCalls, legalPlays } from "../src/index.ts"
import { createRound, sfc32, uniformBelow } from "../src/server.ts"
import type { Action, RoundState, Seed } from "../src/types.ts"

function policy(state: RoundState, next: () => number): Action {
  if (state.phase === "bidding") {
    const legal = legalBids(state)
    const bidder = (state.dealer + 1) % state.playerCount
    const seat = state.toAct!
    if (seat === bidder || !legal.pass) return { type: "bid", seat, amount: legal.amounts[0]! }
    return { type: "pass", seat }
  }
  if (state.phase === "call") {
    const calls = legalCalls(state)
    return { type: "call", seat: state.bidder!, card: calls[uniformBelow(next, calls.length)]! }
  }
  const plays = legalPlays(state)
  return { type: "play", seat: state.toAct!, card: plays[uniformBelow(next, plays.length)]! }
}

function play(seed: Seed): { seed: Seed; actions: Action[]; final: RoundState } | null {
  const actions: Action[] = []
  const next = sfc32([8, 9, 10, 11])
  let state = createRound({ playerCount: 6, dealer: 2, seed })
  let guard = 0
  while (state.phase !== "scored") {
    if (state.phase === "redeal" || ++guard > 400) return null
    const action = policy(state, next)
    actions.push(action)
    const result = apply(state, action)
    if (!result.ok) throw new Error(result.error)
    state = result.state
  }
  return { seed, actions, final: state }
}

function assertPlain(value: unknown): void {
  if (value === null || typeof value === "number" || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "undefined" || typeof value === "bigint") {
    throw new Error(`State contains ${typeof value}.`)
  }
  if (Array.isArray(value)) {
    for (const item of value) assertPlain(item)
    return
  }
  if (typeof value === "object") {
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
    for (const item of Object.values(value)) assertPlain(item)
    return
  }
  throw new Error(`State contains ${typeof value}.`)
}

describe("replay", () => {
  it("rebuilds the same final state from the seed and the ordered actions", () => {
    let played: ReturnType<typeof play> = null
    for (let n = 0; n < 20 && !played; n += 1) played = play([n + 1, 4, 5, 6])
    if (!played) throw new Error("Could not finish a round.")

    const replay = (start: RoundState) => {
      let state = start
      for (const action of played.actions) state = expectOk(apply(state, action))
      return state
    }
    const again = replay(createRound({ playerCount: 6, dealer: 2, seed: played.seed }))
    const restored = replay(JSON.parse(JSON.stringify(createRound({ playerCount: 6, dealer: 2, seed: played.seed }))))
    expect(again).toEqual(played.final)
    expect(restored).toEqual(played.final)
    expect(JSON.parse(JSON.stringify(played.final))).toEqual(played.final)
    assertPlain(played.final)
  })
})

function expectOk(result: ReturnType<typeof apply>): RoundState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}
