import { useRef, useState } from "react"
import { sortHand } from "@hidden-partner/rules"
import type { Card, Suit } from "@hidden-partner/rules"
import { cardName, suitMark } from "./labels.ts"
import { playBlockReason } from "./reasons.ts"
import { Button } from "../ui.tsx"

export function HandRack({
  hand,
  legalPlays,
  lead,
  confirm,
  onPlay,
}: {
  hand: Card[]
  legalPlays: { suit: Suit; rank: Card["rank"]; copy: number }[] | null
  lead: Suit | null
  confirm: boolean
  onPlay: (card: Card) => void
}) {
  const [reason, setReason] = useState<string | null>(null)
  const [pending, setPending] = useState<Card | null>(null)
  const hold = useRef(0)
  const cards = sortHand(hand)

  function showReason(next: string) {
    setReason(next)
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Your hand">
      {reason ? (
        <p role="status" data-testid="card-reason" className="rounded-2xl bg-black/30 px-3 py-2 text-base">
          {reason}
        </p>
      ) : null}
      {pending ? (
        <div role="dialog" aria-label="Confirm play" className="flex flex-wrap items-center gap-2 rounded-2xl bg-black/30 px-3 py-2">
          <p className="text-base">Play the {cardName(pending)}?</p>
          <Button type="button" className="min-h-11 px-3" onClick={() => { onPlay(pending); setPending(null) }}>
            Play
          </Button>
          <Button type="button" variant="quiet" className="min-h-11 px-3" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </div>
      ) : null}
      <div data-testid="hand" className="grid grid-cols-6 gap-1 sm:grid-cols-12">
        {cards.map((card) => {
          const blocked = playBlockReason(card, legalPlays, lead)
          const mark = suitMark(card.suit)
          return (
            <button
              key={`${card.suit}${card.rank}${card.copy}`}
              type="button"
              data-testid="hand-card"
              data-legal={blocked ? "false" : "true"}
              data-suit={card.suit}
              data-rank={card.rank}
              data-copy={card.copy}
              aria-disabled={blocked ? true : undefined}
              aria-label={blocked ? `${cardName(card)}. ${blocked}` : cardName(card)}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-0.5 py-1 text-sm font-semibold ${
                blocked
                  ? `border-cream/30 bg-black/20 opacity-60 ${mark.red ? "text-[#ffb4b4]" : "text-cream"}`
                  : `border-gold bg-cream ${mark.red ? "text-[#9d1c2b]" : "text-ink"}`
              }`}
              onPointerDown={() => {
                if (!blocked) return
                hold.current = window.setTimeout(() => showReason(blocked), 450)
              }}
              onPointerUp={() => window.clearTimeout(hold.current)}
              onPointerLeave={() => window.clearTimeout(hold.current)}
              onClick={() => {
                if (blocked) {
                  showReason(blocked)
                  return
                }
                if (confirm) setPending(card)
                else onPlay(card)
              }}
            >
              <span aria-hidden="true">{card.rank}</span>
              <span aria-hidden="true">
                {mark.symbol} {mark.letter}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
