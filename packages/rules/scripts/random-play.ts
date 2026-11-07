import { bidFloor, legalBids, legalCalls, legalPlays } from "../src/index.ts"
import { apply, createRound, sfc32, uniformBelow } from "../src/server.ts"
import type { RoundState, Seed } from "../src/types.ts"

export const ROUNDS = 10_000
export const HARNESS: Seed = [0x51f1c0de, 0x00a11ce, 0x1234abcd, 0x90abcdef]

export type Sample = {
  teamPoints: number
  copiesHeld: 1 | 2
  teamSize: number
}

export type PlayRun = {
  stuck: number
  redeals: number
  samples: Sample[]
  problem: string
}

function elect(state: RoundState, bidder: number): RoundState {
  let guard = 0
  while (state.phase === "bidding") {
    if (++guard > 40) throw new Error("The auction did not finish.")
    const seat = state.toAct
    if (seat === null) throw new Error("Nobody is due to bid.")
    const legal = legalBids(state)
    if (seat === bidder || !legal.pass) {
      const amount = legal.amounts[0]
      if (amount === undefined) throw new Error("No legal bid.")
      const result = apply(state, { type: "bid", seat, amount })
      if (!result.ok) throw new Error(result.error)
      state = result.state
    } else {
      const result = apply(state, { type: "pass", seat })
      if (!result.ok) throw new Error(result.error)
      state = result.state
    }
  }
  return state
}

export function playRandomRounds(playerCount: number, rounds = ROUNDS): PlayRun {
  const next = sfc32([HARNESS[0], HARNESS[1] ^ playerCount, HARNESS[2], HARNESS[3]])
  const floor = bidFloor(playerCount)
  const samples: Sample[] = []
  let stuck = 0
  let redeals = 0
  let problem = ""

  while (samples.length < rounds) {
    const seed: Seed = [next(), next(), next(), next()]
    const bidder = uniformBelow(next, playerCount)
    try {
      let state = elect(createRound({ playerCount, dealer: 0, seed }), bidder)
      if (state.phase === "redeal") {
        redeals += 1
        continue
      }
      if (state.phase !== "call" || state.bid !== floor || state.bidder !== bidder) {
        stuck += 1
        problem ||= `The auction did not elect the chosen bidder at ${floor}.`
        continue
      }
      const calls = legalCalls(state)
      const called = calls[uniformBelow(next, calls.length)]
      if (!called) {
        stuck += 1
        problem ||= "The call had no card."
        continue
      }
      let result = apply(state, { type: "call", seat: bidder, card: called })
      if (!result.ok) {
        stuck += 1
        problem ||= result.error
        continue
      }
      state = result.state
      let guard = 0
      let failed = false
      while (state.phase === "play") {
        if (++guard > 200 || state.toAct === null) {
          failed = true
          problem ||= "Play did not finish."
          break
        }
        const plays = legalPlays(state)
        const card = plays[uniformBelow(next, plays.length)]
        if (!card) {
          failed = true
          problem ||= "A player had no legal card."
          break
        }
        result = apply(state, { type: "play", seat: state.toAct, card })
        if (!result.ok) {
          failed = true
          problem ||= result.error
          break
        }
        state = result.state
      }
      if (failed || state.phase !== "scored" || !state.result) {
        stuck += 1
        continue
      }
      const trickPoints = state.tricks.reduce((sum, trick) => sum + trick.points, 0)
      const handsEmpty = state.hands.every((hand) => hand.length === 0)
      if (
        state.tricks.length !== 12 ||
        trickPoints !== 2520 ||
        state.result.teamPoints + state.result.othersPoints !== 2520 ||
        !handsEmpty
      ) {
        stuck += 1
        problem ||= "A finished round broke an invariant."
        continue
      }
      samples.push({
        teamPoints: state.result.teamPoints,
        copiesHeld: state.result.copiesHeld,
        teamSize: 1 + state.result.partners.length,
      })
    } catch (error) {
      stuck += 1
      problem ||= error instanceof Error ? error.message : String(error)
    }
  }

  return { stuck, redeals, samples, problem }
}

export function makeRate(points: readonly number[], floor: number): number {
  let made = 0
  for (const value of points) if (value >= floor) made += 1
  return points.length === 0 ? 0 : made / points.length
}

export function percentile(points: readonly number[], p: number): number {
  const sorted = [...points].sort((left, right) => left - right)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))] ?? 0
}
