import { HAND_SIZE } from "@hidden-partner/rules"
import type { Card, Rank, Suit } from "@hidden-partner/rules"

const SUITS: Record<Suit, { symbol: string; name: string; letter: string; red: boolean }> = {
  C: { symbol: "♣", name: "clubs", letter: "C", red: false },
  D: { symbol: "♦", name: "diamonds", letter: "D", red: true },
  H: { symbol: "♥", name: "hearts", letter: "H", red: true },
  S: { symbol: "♠", name: "spades", letter: "S", red: false },
}

const RANKS: Record<Rank, string> = {
  A: "ace",
  K: "king",
  Q: "queen",
  J: "jack",
  "10": "10",
  "9": "9",
  "8": "8",
  "7": "7",
  "6": "6",
}

export function suitName(suit: Suit): string {
  return SUITS[suit].name
}

export function suitMark(suit: Suit): { symbol: string; letter: string; red: boolean } {
  const suitInfo = SUITS[suit]
  return { symbol: suitInfo.symbol, letter: suitInfo.letter, red: suitInfo.red }
}

export function cardName(card: { suit: Suit; rank: Rank }): string {
  return `${RANKS[card.rank]} of ${suitName(card.suit)}`
}

export function points(value: number): string {
  const text = Math.abs(value).toLocaleString("en-US")
  return value < 0 ? `−${text}` : text
}

export function delta(value: number): string {
  if (value > 0) return `+${points(value)}`
  if (value < 0) return `−${points(Math.abs(value))}`
  return "0"
}

export function cardsRemaining(completedTricks: number, playedThisTrick: boolean): number {
  return HAND_SIZE - completedTricks - (playedThisTrick ? 1 : 0)
}

export function lastBidText(passed: boolean, bids: { seat: number; amount: number }[], seat: number): string | null {
  if (passed) return "Pass"
  const mine = bids.filter((bid) => bid.seat === seat)
  const last = mine[mine.length - 1]
  return last ? points(last.amount) : null
}

export function sameCard(left: Card, right: { suit: Suit; rank: Rank; copy: number }): boolean {
  return left.suit === right.suit && left.rank === right.rank && left.copy === right.copy
}
