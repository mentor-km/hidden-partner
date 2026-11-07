import { describe, expect, it } from "vitest"
import { BID_FLOORS, apply, legalBids } from "../src/index.ts"
import type { RoundState } from "../src/types.ts"
import { freshBidding, unwrap } from "./helpers.ts"

function passAllUntil(state: RoundState, stop: number): RoundState {
  let guard = 0
  while (state.phase === "bidding" && state.toAct !== stop) {
    if (++guard > 20) throw new Error("Did not reach that seat.")
    state = unwrap(apply(state, { type: "pass", seat: state.toAct! }))
  }
  return state
}

describe("bidding", () => {
  it("opens at the floor configured for that player count", () => {
    const previous = BID_FLOORS[8]
    BID_FLOORS[8] = 1400
    try {
      expect(legalBids(freshBidding(8, 0)).amounts).toEqual([1400])
    } finally {
      BID_FLOORS[8] = previous
    }
  })

  it("starts with the seat to the dealer's left", () => {
    const state = freshBidding(7, 3)
    expect(state.phase).toBe("bidding")
    expect(state.toAct).toBe(4)
    expect(legalBids(state)).toEqual({ pass: true, amounts: [1260] })
  })

  it("opens only at 1,260 and then raises by 10 or 50", () => {
    let state = freshBidding(5, 0)
    expect(apply(state, { type: "bid", seat: 1, amount: 1270 }).ok).toBe(false)
    state = unwrap(apply(state, { type: "bid", seat: 1, amount: 1260 }))
    expect(state.highBid).toBe(1260)
    expect(apply(state, { type: "bid", seat: 2, amount: 1300 }).ok).toBe(false)
    state = unwrap(apply(state, { type: "bid", seat: 2, amount: 1270 }))
    expect(state.highBid).toBe(1270)
    state = unwrap(apply(state, { type: "bid", seat: 3, amount: 1320 }))
    expect(state.highBid).toBe(1320)
    expect(state.highBidder).toBe(3)
  })

  it("lets buttons that would pass 2,520 stay off", () => {
    let state = freshBidding(5, 0)
    state = { ...state, highBid: 2510, highBidder: 1, toAct: 2, bids: [{ seat: 1, amount: 2510 }] }
    expect(legalBids(state)).toEqual({ pass: true, amounts: [2520] })
    expect(apply(state, { type: "bid", seat: 2, amount: 2560 }).ok).toBe(false)

    state = { ...state, highBid: 2480, bids: [{ seat: 1, amount: 2480 }] }
    expect(legalBids(state).amounts).toEqual([2490])

    state = { ...state, highBid: 2470, bids: [{ seat: 1, amount: 2470 }] }
    expect(legalBids(state).amounts).toEqual([2480, 2520])
  })

  it("forces the dealer to open at 1,260 when everyone else has passed", () => {
    let state = passAllUntil(freshBidding(5, 0), 0)
    expect(state.toAct).toBe(0)
    expect(legalBids(state)).toEqual({ pass: false, amounts: [1260] })
    const refused = apply(state, { type: "pass", seat: 0 })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.error).toMatch(/1,260/)
    expect(state.phase).toBe("bidding")
    state = unwrap(apply(state, { type: "bid", seat: 0, amount: 1260 }))
    expect(state.phase).not.toBe("bidding")
    expect(state.bidder).toBe(0)
    expect(state.bid).toBe(1260)
  })

  it("ends as soon as one bid stands and every other player has passed", () => {
    let state = unwrap(apply(freshBidding(5, 0), { type: "bid", seat: 1, amount: 1260 }))
    for (const seat of [2, 3, 4, 0]) {
      expect(state.phase).toBe("bidding")
      state = unwrap(apply(state, { type: "pass", seat }))
    }
    expect(state.phase).not.toBe("bidding")
    expect(state.bidder).toBe(1)
    expect(state.bid).toBe(1260)
    expect(apply(state, { type: "bid", seat: 1, amount: 1270 }).ok).toBe(false)
  })

  it("treats a pass as final and skips that seat", () => {
    let state = unwrap(apply(freshBidding(5, 0), { type: "pass", seat: 1 }))
    state = unwrap(apply(state, { type: "bid", seat: 2, amount: 1260 }))
    state = unwrap(apply(state, { type: "bid", seat: 3, amount: 1270 }))
    const seen: number[] = []
    while (state.phase === "bidding") {
      seen.push(state.toAct!)
      const legal = legalBids(state)
      if (state.toAct === 2) {
        state = unwrap(apply(state, { type: "bid", seat: 2, amount: legal.amounts[0]! }))
      } else if (legal.pass) {
        state = unwrap(apply(state, { type: "pass", seat: state.toAct! }))
      } else {
        state = unwrap(apply(state, { type: "bid", seat: state.toAct!, amount: legal.amounts[0]! }))
      }
    }
    expect(seen).not.toContain(1)
    expect(apply(state, { type: "bid", seat: 1, amount: 1260 }).ok).toBe(false)
    expect(state.bidder).toBe(2)
  })

  it("ends the auction at once when the bid reaches 2,520", () => {
    let state = freshBidding(5, 0, [3, 1, 4, 1])
    let guard = 0
    while (state.phase === "bidding") {
      if (++guard > 80) throw new Error("The auction did not reach 2,520.")
      const seat = state.toAct!
      const legal = legalBids(state)
      if (seat === 1 || seat === 2) {
        const amount = legal.amounts[legal.amounts.length - 1]!
        const result = apply(state, { type: "bid", seat, amount })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        state = result.state
        if (amount === 2520) {
          expect(state.phase).not.toBe("bidding")
          expect(state.bid).toBe(2520)
          expect(state.bidder).toBe(seat)
          expect(state.passed.some((value, index) => !value && index !== seat)).toBe(true)
        }
      } else {
        state = unwrap(apply(state, { type: "pass", seat }))
      }
    }
    expect(state.bid).toBe(2520)
    expect(apply(state, { type: "pass", seat: state.bidder === 1 ? 2 : 1 }).ok).toBe(false)
  })
})
