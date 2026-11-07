import type { Card, CardName, Rank, Suit } from "./types.ts"

export const SUITS = ["C", "D", "H", "S"] as const satisfies readonly Suit[]
export const RANKS = ["A", "K", "Q", "J", "10", "9", "8", "7", "6"] as const satisfies readonly Rank[]

export const POOL = 2520
export const BID_CAP = 2520
/** Opening bid for each player count. This table is the only place the floor is set. */
export const BID_FLOORS: Record<5 | 6 | 7 | 8 | 9, number> = {
  5: 1570,
  6: 1390,
  7: 1260,
  8: 1140,
  9: 1050,
}
export const HAND_SIZE = 12
export const TRICKS = 12

const CALLABLE: ReadonlySet<string> = new Set(["A", "K", "Q", "J", "10"])

const POINTS: Record<Rank, number> = {
  A: 100,
  K: 50,
  Q: 30,
  J: 20,
  "10": 10,
  "9": 0,
  "8": 0,
  "7": 0,
  "6": 0,
}

export function cardPoints(rank: Rank): number {
  return POINTS[rank]
}

export function bidFloor(playerCount: number): number {
  if (!Number.isInteger(playerCount) || playerCount < 5 || playerCount > 9) {
    throw new Error("Player count must be from 5 to 9.")
  }
  return BID_FLOORS[playerCount as 5 | 6 | 7 | 8 | 9]
}

export function rankValue(rank: Rank): number {
  return RANKS.length - 1 - RANKS.indexOf(rank)
}

export function cardsEqual(left: Card, right: Card): boolean {
  return left.suit === right.suit && left.rank === right.rank && left.copy === right.copy
}

export function namesEqual(left: CardName, right: CardName): boolean {
  return left.suit === right.suit && left.rank === right.rank
}

export function sortHand(hand: readonly Card[]): Card[] {
  return hand.map(copyCard).sort((left, right) => {
    const suit = SUITS.indexOf(left.suit) - SUITS.indexOf(right.suit)
    if (suit !== 0) return suit
    const rank = RANKS.indexOf(left.rank) - RANKS.indexOf(right.rank)
    if (rank !== 0) return rank
    return left.copy - right.copy
  })
}

export function copyCard(card: Card): Card {
  return { suit: card.suit, rank: card.rank, copy: card.copy }
}

export function buildDeck(playerCount: number): Card[] {
  if (!Number.isInteger(playerCount) || playerCount < 5 || playerCount > 9) {
    throw new Error("Player count must be from 5 to 9.")
  }
  const ranks = RANKS.slice(0, playerCount)
  const deck: Card[] = []
  for (const copy of [0, 1, 2]) {
    for (const suit of SUITS) {
      for (const rank of ranks) {
        deck.push({ suit, rank, copy })
      }
    }
  }
  return deck
}

export function callableCards(hand: readonly Card[]): CardName[] {
  const counts: Record<string, number> = {}
  for (const card of hand) {
    const key = `${card.suit}${card.rank}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  const names: CardName[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (!CALLABLE.has(rank)) continue
      const count = counts[`${suit}${rank}`] ?? 0
      if (count === 1 || count === 2) names.push({ suit, rank })
    }
  }
  return names
}
