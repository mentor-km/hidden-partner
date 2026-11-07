import { useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { sortHand } from "@hidden-partner/rules"
import type { Card, Suit } from "@hidden-partner/rules"
import { CardFace } from "./CardFace.tsx"
import { cardName } from "./labels.ts"
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
  const reduce = useReducedMotion() === true
  const waiting = legalPlays === null
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
          const quiet = Boolean(blocked) && !waiting
          const flight = `card-${card.suit}-${card.rank}-${card.copy}`
          return (
            <button
              key={flight}
              type="button"
              data-testid="hand-card"
              data-legal={blocked ? "false" : "true"}
              data-suit={card.suit}
              data-rank={card.rank}
              data-copy={card.copy}
              data-waiting={waiting ? "true" : "false"}
              aria-disabled={blocked ? true : undefined}
              aria-label={blocked ? `${cardName(card)}. ${blocked}` : cardName(card)}
              className={`flex min-h-14 items-stretch rounded-xl border p-0.5 ${
                quiet ? "border-cream/40 opacity-80" : "border-transparent"
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
              <motion.span layoutId={reduce ? undefined : flight} className="flex w-full">
                <CardFace rank={card.rank} suit={card.suit} />
              </motion.span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
