import type { RoundResult } from "./types.ts"

export function bidMade(teamPoints: number, bid: number): boolean {
  return teamPoints >= bid
}

export function scoreChanges(input: {
  playerCount: number
  bidder: number
  partners: readonly number[]
  bid: number
  made: boolean
  copiesHeld: 1 | 2
}): number[] {
  const bidderSign = input.made ? 2 : input.copiesHeld === 2 ? -2 : -1
  const partnerSign = input.made ? 1 : -1
  const otherSign = input.made ? -1 : 1
  return Array.from({ length: input.playerCount }, (_, seat) => {
    if (seat === input.bidder) return bidderSign * input.bid
    if (input.partners.includes(seat)) return partnerSign * input.bid
    return otherSign * input.bid
  })
}

export function roundResult(input: {
  playerCount: number
  bidder: number
  partners: readonly number[]
  bid: number
  copiesHeld: 1 | 2
  teamPoints: number
  othersPoints: number
  calledCard: RoundResult["calledCard"]
}): RoundResult {
  const made = bidMade(input.teamPoints, input.bid)
  return {
    bidder: input.bidder,
    bid: input.bid,
    calledCard: { suit: input.calledCard.suit, rank: input.calledCard.rank },
    copiesHeld: input.copiesHeld,
    partners: [...input.partners],
    teamPoints: input.teamPoints,
    othersPoints: input.othersPoints,
    made,
    scoreChanges: scoreChanges({
      playerCount: input.playerCount,
      bidder: input.bidder,
      partners: input.partners,
      bid: input.bid,
      made,
      copiesHeld: input.copiesHeld,
    }),
  }
}
