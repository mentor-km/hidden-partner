import { buildDeck, sortHand } from "./cards.ts"
import { sfc32, uniformBelow } from "./rng.ts"
import type { Card, RoundState, Seed } from "./types.ts"

export function shuffle(cards: readonly Card[], seed: Seed): Card[] {
  const next = sfc32(normalizeSeed(seed))
  const deck = cards.map(copy)
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = uniformBelow(next, index + 1)
    const current = deck[index]!
    deck[index] = deck[swap]!
    deck[swap] = current
  }
  return deck
}

export function deal(deck: readonly Card[], playerCount: number, dealer: number): Card[][] {
  const hands: Card[][] = Array.from({ length: playerCount }, () => [])
  deck.forEach((card, index) => {
    const seat = (dealer + 1 + index) % playerCount
    hands[seat]!.push(copy(card))
  })
  return hands.map(sortHand)
}

export function createRound(input: { playerCount: number; dealer: number; seed: Seed }): RoundState {
  if (!Number.isInteger(input.playerCount) || input.playerCount < 5 || input.playerCount > 9) {
    throw new Error("Player count must be from 5 to 9.")
  }
  if (!Number.isInteger(input.dealer) || input.dealer < 0 || input.dealer >= input.playerCount) {
    throw new Error("Dealer must be a seat at the table.")
  }
  if (!Array.isArray(input.seed) || input.seed.length !== 4 || input.seed.some((part) => !Number.isInteger(part))) {
    throw new Error("Seed must be four integers.")
  }
  const seed = normalizeSeed(input.seed)
  const hands = deal(shuffle(buildDeck(input.playerCount), seed), input.playerCount, input.dealer)
  return {
    playerCount: input.playerCount,
    dealer: input.dealer,
    seed,
    hands,
    phase: "bidding",
    passed: Array.from({ length: input.playerCount }, () => false),
    bids: [],
    highBid: null,
    highBidder: null,
    toAct: (input.dealer + 1) % input.playerCount,
    bidder: null,
    bid: null,
    calledCard: null,
    trump: null,
    partners: null,
    copiesHeld: null,
    revealedPartners: [],
    currentTrick: [],
    tricks: [],
    leader: null,
    result: null,
  }
}

function normalizeSeed(seed: Seed): Seed {
  return [seed[0] >>> 0, seed[1] >>> 0, seed[2] >>> 0, seed[3] >>> 0]
}

function copy(card: Card): Card {
  return { suit: card.suit, rank: card.rank, copy: card.copy }
}
