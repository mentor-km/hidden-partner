import { describe, expect, it } from "vitest"
import { apply, bidFloor, callableCards, legalCalls } from "../src/index.ts"
import { c, completeHands, electAtFloor, freshBidding, unwrap } from "./helpers.ts"

function rankSuit(rank: string, suit: string, copy: number) {
  return c(`${rank}${suit}${copy}`)
}

describe("the call", () => {
  it("refuses a card the bidder holds three times and accepts one held once", () => {
    const bidder = [
      ...[0, 1, 2].map((copy) => rankSuit("A", "S", copy)),
      ...[0, 1, 2].map((copy) => rankSuit("K", "S", copy)),
      ...[0, 1, 2].map((copy) => rankSuit("Q", "S", copy)),
      ...[0, 1].map((copy) => rankSuit("J", "S", copy)),
      rankSuit("A", "H", 0),
    ]
    let state = freshBidding(5, 0, [2, 2, 2, 2])
    state = { ...state, hands: completeHands(5, [bidder, [], [], [], []]) }
    state = electAtFloor(state, 0)
    expect(state.phase).toBe("call")
    const callable = callableCards(state.hands[0]!)
    expect(callable.some((card) => card.rank === "A" && card.suit === "S")).toBe(false)
    expect(legalCalls(state)).toEqual(callable)
    const refused = apply(state, { type: "call", seat: 0, card: { suit: "S", rank: "A" } })
    expect(refused.ok).toBe(false)
    expect(state.phase).toBe("call")
    state = unwrap(apply(state, { type: "call", seat: 0, card: { suit: "H", rank: "A" } }))
    expect(state.phase).toBe("play")
    expect(state.trump).toBe("H")
    expect(state.calledCard).toEqual({ suit: "H", rank: "A" })
    expect(state.copiesHeld).toBe(1)
    expect(state.leader).toBe(0)
    expect(state.toAct).toBe(0)
  })

  it("redeals when the bidder has no callable card", () => {
    const bidder = ["A", "K", "Q", "J"].flatMap((rank) => [0, 1, 2].map((copy) => rankSuit(rank, "S", copy)))
    let state = freshBidding(5, 0, [3, 3, 3, 3])
    state = { ...state, hands: completeHands(5, [bidder, [], [], [], []]) }
    state = electAtFloor(state, 0)
    expect(state.phase).toBe("redeal")
    expect(state.bidder).toBe(0)
    expect(state.bid).toBe(bidFloor(5))
    expect(state.partners).toBeNull()
    expect(state.result).toBeNull()
    expect(state.toAct).toBeNull()
    expect(apply(state, { type: "call", seat: 0, card: { suit: "S", rank: "A" } }).ok).toBe(false)
  })

  it("names one partner when the other two copies are in one hand", () => {
    let state = freshBidding(5, 0, [4, 4, 4, 4])
    state = {
      ...state,
      hands: completeHands(5, [[c("AS0")], [c("AS1"), c("AS2")], [], [], []]),
    }
    state = electAtFloor(state, 0)
    state = unwrap(apply(state, { type: "call", seat: 0, card: { suit: "S", rank: "A" } }))
    expect(state.copiesHeld).toBe(1)
    expect(state.partners).toEqual([1])
    expect(state.partners).not.toContain(0)
  })

  it("names two partners when the other two copies are split", () => {
    let state = freshBidding(5, 0, [5, 5, 5, 5])
    state = {
      ...state,
      hands: completeHands(5, [[c("AS0")], [c("AS1")], [c("AS2")], [], []]),
    }
    state = electAtFloor(state, 0)
    state = unwrap(apply(state, { type: "call", seat: 0, card: { suit: "S", rank: "A" } }))
    expect(state.copiesHeld).toBe(1)
    expect(state.partners).toEqual([1, 2])
  })

  it("names one partner when the bidder holds two copies", () => {
    let state = freshBidding(5, 0, [6, 6, 6, 6])
    state = {
      ...state,
      hands: completeHands(5, [[c("AS0"), c("AS1")], [c("AS2")], [], [], []]),
    }
    state = electAtFloor(state, 0)
    state = unwrap(apply(state, { type: "call", seat: 0, card: { suit: "S", rank: "A" } }))
    expect(state.copiesHeld).toBe(2)
    expect(state.partners).toEqual([1])
  })

  it("refuses a call below 10", () => {
    let state = freshBidding(6, 0, [7, 7, 7, 7])
    state = { ...state, hands: completeHands(6, [[c("9C0"), c("AH0")], [], [], [], [], []]) }
    state = electAtFloor(state, 0)
    expect(state.phase).toBe("call")
    expect(legalCalls(state).every((card) => ["A", "K", "Q", "J", "10"].includes(card.rank))).toBe(true)
    const refused = apply(state, { type: "call", seat: 0, card: { suit: "C", rank: "9" } })
    expect(refused.ok).toBe(false)
    expect(state.phase).toBe("call")
  })
})
