import type { MatchRound, MatchState, RoundResult } from "./types.ts"

export function createMatch(playerCount: number): MatchState {
  return {
    playerCount,
    totals: Array.from({ length: playerCount }, () => 0),
    rounds: [],
  }
}

export function toMatchRound(result: RoundResult): MatchRound {
  return {
    bidder: result.bidder,
    bid: result.bid,
    calledCard: { suit: result.calledCard.suit, rank: result.calledCard.rank },
    partners: [...result.partners],
    teamPoints: result.teamPoints,
    othersPoints: result.othersPoints,
    made: result.made,
    scoreChanges: [...result.scoreChanges],
  }
}

export function recordRound(match: MatchState, result: RoundResult): MatchState {
  const round = toMatchRound(result)
  return {
    playerCount: match.playerCount,
    totals: match.totals.map((total, seat) => total + round.scoreChanges[seat]!),
    rounds: [...match.rounds, round],
  }
}

export function winners(match: MatchState): number[] {
  const best = Math.max(...match.totals)
  return match.totals.flatMap((total, seat) => (total === best ? [seat] : []))
}

export function nextDealer(dealer: number, playerCount: number): number {
  return (dealer + 1) % playerCount
}
