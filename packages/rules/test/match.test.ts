import { describe, expect, it } from "vitest"
import { apply, createMatch, legalCalls, nextDealer, recordRound, scoreChanges, winners } from "../src/index.ts"
import { createRound } from "../src/server.ts"
import type { Card, CardName, RoundResult, Seed } from "../src/types.ts"
import { electAtFloor, playOut, unwrap } from "./helpers.ts"

type PlayedRound = {
  seed: Seed
  dealer: number
  bidder: number
  card: CardName
  callIndex: number
  hands: Card[][]
  partners: number[]
  result: RoundResult
}

function holders(hands: Card[][], card: CardName, bidder: number): number[] {
  const partners: number[] = []
  hands.forEach((hand, seat) => {
    if (seat !== bidder && hand.some((held) => held.suit === card.suit && held.rank === card.rank)) {
      partners.push(seat)
    }
  })
  return partners
}

function playSeed(playerCount: number, seed: Seed, dealer: number, callIndex: number): PlayedRound | null {
  let state = createRound({ playerCount, dealer, seed })
  const bidder = (dealer + 1) % playerCount
  state = electAtFloor(state, bidder)
  if (state.phase !== "call") return null
  const calls = legalCalls(state)
  const card = calls[callIndex % calls.length]
  if (!card) return null
  const hands = state.hands.map((hand) => hand.map((held) => ({ ...held })))
  state = unwrap(apply(state, { type: "call", seat: bidder, card }))
  const finished = playOut(state).state
  if (!finished.result) return null
  return { seed, dealer, bidder, card, callIndex, hands, partners: holders(hands, card, bidder), result: finished.result }
}

function findRound(playerCount: number, dealer: number, salt: number): PlayedRound {
  for (let n = 0; n < 40; n += 1) {
    const seed: Seed = [20 + salt, n + 1, 5, 6]
    for (let callIndex = 0; callIndex < 4; callIndex += 1) {
      const played = playSeed(playerCount, seed, dealer, callIndex)
      if (played) return played
    }
  }
  throw new Error("Could not finish a round.")
}

function findDifferent(first: PlayedRound): PlayedRound {
  for (let salt = 1; salt < 30; salt += 1) {
    const next = findRound(5, nextDealer(first.dealer, 5), salt)
    const differentCard = next.card.suit !== first.card.suit || next.card.rank !== first.card.rank
    if (differentCard && next.partners.join() !== first.partners.join()) return next
  }
  throw new Error("Could not find a second round with a different call and partners.")
}

describe("match scoring", () => {
  it("moves the dealer one seat clockwise", () => {
    expect(nextDealer(0, 5)).toBe(1)
    expect(nextDealer(4, 5)).toBe(0)
    expect(nextDealer(8, 9)).toBe(0)
  })

  it("names every tied player a co-winner", () => {
    expect(winners(createMatch(5))).toEqual([0, 1, 2, 3, 4])
    const round = (changes: number[]): RoundResult => ({
      bidder: 0,
      bid: 100,
      calledCard: { suit: "S", rank: "A" },
      copiesHeld: 1,
      partners: [1],
      teamPoints: 0,
      othersPoints: 2520,
      made: false,
      scoreChanges: changes,
    })
    let match = recordRound(createMatch(5), round([0, 5, 5, 0, 0]))
    match = recordRound(match, round([1, 0, 0, 1, 0]))
    expect(match.totals).toEqual([1, 5, 5, 1, 0])
    expect(winners(match)).toEqual([1, 2])
  })

  it("keeps each round's partners and scores independent of the round before it", () => {
    const first = findRound(5, 0, 0)
    const second = findDifferent(first)
    let match = recordRound(createMatch(5), first.result)
    const alone = playSeed(5, second.seed, second.dealer, second.callIndex)
    match = recordRound(match, second.result)

    expect(alone?.result).toEqual(second.result)
    expect(second.partners).toEqual(holders(second.hands, second.card, second.bidder))
    expect(second.result.partners).toEqual(second.partners)
    expect(second.result.partners).not.toEqual(first.result.partners)
    expect(second.card).not.toEqual(first.card)
    expect(second.result.scoreChanges).toEqual(
      scoreChanges({
        playerCount: 5,
        bidder: second.bidder,
        partners: second.partners,
        bid: second.result.bid,
        made: second.result.made,
        copiesHeld: second.result.copiesHeld,
      }),
    )
    expect(match.totals).toEqual(
      first.result.scoreChanges.map((change, seat) => change + second.result.scoreChanges[seat]!),
    )
    expect(match.rounds).toHaveLength(2)
    expect(match.rounds[1]?.partners).toEqual(second.partners)
    expect(match.rounds[0]?.calledCard).not.toEqual(match.rounds[1]?.calledCard)
    expect(match).not.toHaveProperty("hands")
    expect(match).not.toHaveProperty("seed")
    expect(match).not.toHaveProperty("partners")
    expect(match.rounds[0]).not.toHaveProperty("hands")
    expect(JSON.stringify(match)).not.toContain('"seed"')
  })
})
