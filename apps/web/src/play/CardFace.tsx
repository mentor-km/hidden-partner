import type { Rank, Suit } from "@hidden-partner/rules"
import { suitMark } from "./labels.ts"

export function CardFace({
  rank,
  suit,
  large = false,
}: {
  rank: Rank
  suit: Suit
  large?: boolean
}) {
  const mark = suitMark(suit)
  const ink = mark.red ? "text-[#9d1c2b]" : "text-ink"
  return (
    <span
      className={`flex flex-col items-center justify-center rounded-lg border border-gold bg-cream font-semibold ${ink} ${
        large ? "min-h-16 min-w-12 px-1 text-base" : "min-h-12 w-full px-0.5 text-sm"
      }`}
    >
      <span aria-hidden="true">{rank}</span>
      <span aria-hidden="true">{mark.symbol}</span>
    </span>
  )
}
