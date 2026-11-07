import type { Card, Suit } from "@hidden-partner/rules"
import { sameCard, suitName } from "./labels.ts"

export function playBlockReason(
  card: Card,
  legalPlays: { suit: Suit; rank: Card["rank"]; copy: number }[] | null,
  lead: Suit | null,
): string | null {
  if (!legalPlays) return "You cannot play a card now."
  if (legalPlays.some((legal) => sameCard(card, legal))) return null
  if (lead && legalPlays.length > 0 && legalPlays.every((legal) => legal.suit === lead) && card.suit !== lead) {
    return `You must follow ${suitName(lead)}.`
  }
  return "That card cannot be played."
}
