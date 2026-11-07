import { describe, expect, it } from "vitest"
import { scoreChanges, bidMade } from "../src/index.ts"
import type { Card, RoundResult } from "../src/types.ts"
import { c, completeHands, playHands } from "./helpers.ts"

function highSpades(): Card[] {
  return ["A", "K", "Q", "J"].flatMap((rank) => [0, 1, 2].map((copy) => c(`${rank}S${copy}`)))
}

function expectCaptured(result: RoundResult, tricks: { winner: number; points: number }[]) {
  const team = new Set([result.bidder, ...result.partners])
  const teamPoints = tricks.filter((trick) => team.has(trick.winner)).reduce((sum, trick) => sum + trick.points, 0)
  const othersPoints = tricks.filter((trick) => !team.has(trick.winner)).reduce((sum, trick) => sum + trick.points, 0)
  expect(result.teamPoints).toBe(teamPoints)
  expect(result.othersPoints).toBe(othersPoints)
  expect(teamPoints + othersPoints).toBe(2520)
  expect(result.made).toBe(bidMade(teamPoints, result.bid))
  expect(result.scoreChanges).toEqual(
    scoreChanges({
      playerCount: result.scoreChanges.length,
      bidder: result.bidder,
      partners: result.partners,
      bid: result.bid,
      made: result.made,
      copiesHeld: result.copiesHeld,
    }),
  )
}

describe("round scoring", () => {
  it("makes the bid when the team has at least X, including an equal total", () => {
    expect(bidMade(1260, 1260)).toBe(true)
    expect(bidMade(1259, 1260)).toBe(false)
    expect(bidMade(2520, 2520)).toBe(true)
  })

  it("scores a made bid as +2X / +1X / -1X for one or two copies", () => {
    expect(
      scoreChanges({ playerCount: 7, bidder: 0, partners: [1, 2], bid: 1300, made: true, copiesHeld: 1 }),
    ).toEqual([2600, 1300, 1300, -1300, -1300, -1300, -1300])
    expect(
      scoreChanges({ playerCount: 7, bidder: 0, partners: [1], bid: 1300, made: true, copiesHeld: 2 }),
    ).toEqual([2600, 1300, -1300, -1300, -1300, -1300, -1300])
  })

  it("scores a two-copy bust as -2X / -1X / +1X", () => {
    expect(
      scoreChanges({ playerCount: 7, bidder: 0, partners: [1], bid: 1300, made: false, copiesHeld: 2 }),
    ).toEqual([-2600, -1300, 1300, 1300, 1300, 1300, 1300])
  })

  it("scores a one-copy bust as -1X / -1X / +1X, including one partner holding both copies", () => {
    expect(
      scoreChanges({ playerCount: 7, bidder: 0, partners: [1, 2], bid: 1300, made: false, copiesHeld: 1 }),
    ).toEqual([-1300, -1300, -1300, 1300, 1300, 1300, 1300])
    expect(
      scoreChanges({ playerCount: 5, bidder: 0, partners: [1], bid: 1300, made: false, copiesHeld: 1 }),
    ).toEqual([-1300, -1300, 1300, 1300, 1300])
  })

  it("captures every point when the bidder's team wins the made bid with two copies", () => {
    const hands = completeHands(5, [
      ["AS0", "AS1", "KS0", "KS1", "KS2", "QS0", "QS1", "QS2", "JS0", "JS1", "JS2", "10S0"].map(c),
      [c("AS2"), c("10S1"), c("10S2")],
      [],
      [],
      [],
    ])
    const { state } = playHands(hands, { suit: "S", rank: "A" })
    const result = state.result!
    expect(result.copiesHeld).toBe(2)
    expect(result.partners).toEqual([1])
    expect(result.teamPoints).toBe(2520)
    expect(result.made).toBe(true)
    expect(result.scoreChanges).toEqual([2520, 1260, -1260, -1260, -1260])
    expectCaptured(result, state.tricks)
  })

  it("gives the bidder -2X when a two-copy team is bust", () => {
    const hands = completeHands(5, [
      [c("10S0"), c("10S1")],
      [c("10S2")],
      [],
      [],
      highSpades(),
    ])
    const { state } = playHands(hands, { suit: "S", rank: "10" })
    const result = state.result!
    expect(result.copiesHeld).toBe(2)
    expect(result.partners).toEqual([1])
    expect(result.teamPoints).toBe(0)
    expect(result.made).toBe(false)
    expect(result.scoreChanges).toEqual([-2520, -1260, 1260, 1260, 1260])
    expectCaptured(result, state.tricks)
  })

  it("gives the bidder -1X when a one-copy team is bust", () => {
    const hands = completeHands(5, [[c("10S0")], [c("10S1")], [c("10S2")], [], highSpades()])
    const { state } = playHands(hands, { suit: "S", rank: "10" })
    const result = state.result!
    expect(result.copiesHeld).toBe(1)
    expect(result.partners).toEqual([1, 2])
    expect(result.teamPoints).toBe(0)
    expect(result.made).toBe(false)
    expect(result.scoreChanges).toEqual([-1260, -1260, -1260, 1260, 1260])
    expectCaptured(result, state.tricks)
  })
})
