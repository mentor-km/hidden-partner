import { useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { sortHand } from "@hidden-partner/rules"
import type { Card, Suit } from "@hidden-partner/rules"
import { CardFace } from "./CardFace.tsx"
import { cardName } from "./labels.ts"
import { playBlockReason } from "./reasons.ts"

export function HandRack({
  hand,
  legalPlays,
  lead,
  onPlay,
  onReason,
}: {
  hand: Card[]
  legalPlays: { suit: Suit; rank: Card["rank"]; copy: number }[] | null
  lead: Suit | null
  onPlay: (card: Card) => void
  onReason?: (reason: string) => void
}) {
  const [reason, setReason] = useState<string | null>(null)
  const hold = useRef(0)
  const reduce = useReducedMotion() === true
  const waiting = legalPlays === null
  const cards = sortHand(hand)
  const blocked = cards.map((card) => playBlockReason(card, legalPlays, lead))
  const split = !waiting && blocked.some((reason) => reason !== null) && blocked.some((reason) => reason === null)

  function showReason(next: string) {
    if (onReason) onReason(next)
    else setReason(next)
  }

  return (
    <section className="flex flex-col gap-1" aria-label="Your cards">
      <p className="text-sm font-semibold">Your cards</p>
      {reason ? (
        <p role="status" data-testid="card-reason" className="rounded-2xl bg-black/30 px-3 py-2 text-base">
          {reason}
        </p>
      ) : null}
      <div data-testid="hand" className="grid w-full grid-cols-6 gap-1 sm:grid-cols-12">
        {cards.map((card, index) => {
          const why = blocked[index] ?? null
          const bright = split && why === null
          const dim = split && why !== null
          const flight = `card-${card.suit}-${card.rank}-${card.copy}`
          return (
            <button
              key={flight}
              type="button"
              data-testid="hand-card"
              data-legal={why ? "false" : "true"}
              data-suit={card.suit}
              data-rank={card.rank}
              data-copy={card.copy}
              data-waiting={waiting ? "true" : "false"}
              data-highlight={bright ? "true" : "false"}
              data-dimmed={dim ? "true" : "false"}
              aria-disabled={why ? true : undefined}
              aria-label={why ? `${cardName(card)}. ${why}` : cardName(card)}
              className={`flex min-h-12 items-stretch rounded-xl border p-0.5 ${
                bright
                  ? "-translate-y-1 border-gold shadow-[0_0_12px_rgba(240,212,138,0.9)] ring-2 ring-gold"
                  : dim
                    ? "border-cream/30 opacity-40"
                    : "border-transparent"
              }`}
              onPointerDown={() => {
                if (!why) return
                hold.current = window.setTimeout(() => showReason(why), 450)
              }}
              onPointerUp={() => window.clearTimeout(hold.current)}
              onPointerLeave={() => window.clearTimeout(hold.current)}
              onClick={() => {
                if (why) {
                  showReason(why)
                  return
                }
                onPlay(card)
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
