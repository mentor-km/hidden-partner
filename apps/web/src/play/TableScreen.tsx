import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { TRICKS } from "@hidden-partner/rules"
import type { ClientMessage } from "../../../server/src/messages.ts"
import type { RoomView } from "../../../server/src/lobby.ts"
import { BiddingPanel } from "./BiddingPanel.tsx"
import { CallPanel } from "./CallPanel.tsx"
import { HandRack } from "./HandRack.tsx"
import { cardName, cardsRemaining, lastBidText, suitName } from "./labels.ts"
import { loadConfirmPlay, saveConfirmPlay } from "./preferences.ts"
import { FinalScreen, RoundResult } from "./RoundViews.tsx"
import { RulesDrawer } from "./RulesDrawer.tsx"
import { Button } from "../ui.tsx"

export function TableScreen({
  view,
  reconnecting,
  notice,
  onSend,
  onHome,
}: {
  view: RoomView
  reconnecting: boolean
  notice: string | null
  onSend: (message: ClientMessage) => void
  onHome: () => void
}) {
  const game = view.game
  const [confirm, setConfirm] = useState(loadConfirmPlay)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [partners, setPartners] = useState<string[]>([])
  const seenPartners = useRef<{ round: number; seats: Set<number> } | null>(null)
  const host = view.you.seat === view.hostSeat
  const reduce = useReducedMotion() === true

  useEffect(() => {
    if (!game) return
    const revealed = game.seat.revealedPartners.filter((seat) => seat !== game.seat.bidder)
    const seen = seenPartners.current
    if (!seen || seen.round !== game.roundNumber) {
      seenPartners.current = { round: game.roundNumber, seats: new Set(revealed) }
      setPartners([])
      return
    }
    const fresh = revealed.filter((seat) => !seen.seats.has(seat))
    if (fresh.length === 0) return
    for (const seat of fresh) seen.seats.add(seat)
    setPartners((current) => [...current, ...fresh.map((seat) => seatName(view, seat))])
  }, [game, view])

  if (!game) return <p>Waiting for the deal.</p>
  if (view.status === "finished") return <FinalScreen view={view} onHome={onHome} />
  if (game.seat.phase === "scored") {
    return (
      <Frame reconnecting={reconnecting} notice={notice}>
        <RoundResult view={view} onNext={() => onSend({ type: "next_round" })} />
      </Frame>
    )
  }

  const seat = game.seat
  const legal = view.status === "playing" ? game.legal : null
  const actor = seat.toAct === null ? null : view.seats.find((item) => item.seat === seat.toAct)
  const waiting = actor && !actor.connected ? `Waiting for ${actor.name}` : null
  const lead = seat.currentTrick[0]?.card.suit ?? null
  const snapshot = [
    seat.phase,
    seat.toAct ?? "-",
    seat.currentTrick.length,
    seat.completedTricks,
    seat.hand.length,
    seat.highBid ?? "-",
    seat.calledCard ? `${seat.calledCard.suit}${seat.calledCard.rank}` : "-",
  ].join(":")

  return (
    <Frame reconnecting={reconnecting} notice={notice}>
      <div data-testid="table" data-phase={seat.phase} data-snapshot={snapshot} className="flex min-h-0 flex-1 flex-col gap-2">
        <header className="flex flex-col gap-1">
          <p className="text-sm tracking-[0.2em] uppercase">Hidden Partner</p>
          <h1 className="font-display text-3xl">Round {game.roundNumber}</h1>
          <p data-testid="your-seat">You are in seat {view.you.seat + 1}.</p>
          <p data-testid="turn-line" className="text-lg">
            {waiting ?? (actor ? (actor.seat === view.you.seat ? "Your turn" : `${actor.name}'s turn`) : "Waiting")}
          </p>
          {seat.calledCard ? (
            <p data-testid="trump-line">
              Trump is {suitName(seat.calledCard.suit)}, called card {cardName(seat.calledCard)}.
            </p>
          ) : null}
        </header>
        <PartnerBanners names={partners} reduce={reduce} />
        <ol data-testid="seats" className="grid grid-cols-5 gap-1 text-xs leading-tight">
          {view.seats.map((person) => {
            const played = seat.currentTrick.some((play) => play.seat === person.seat)
            const bid = lastBidText(seat.passed[person.seat] ?? false, seat.bids, person.seat)
            return (
              <li key={person.seat} className="min-w-0 rounded-xl bg-black/20 px-1 py-1">
                <p className="truncate font-semibold">
                  {person.name}
                  {person.seat === view.you.seat ? " (you)" : ""}
                </p>
                <p>
                  <span
                    aria-hidden="true"
                    className={`mr-1 inline-block size-2 rounded-full ${person.connected ? "bg-gold" : "bg-cream/50"}`}
                  />
                  {person.connected ? "Online" : "Offline"}
                  {person.seat === seat.dealer ? " · Dealer" : ""}
                  {person.seat === seat.toAct ? " · Turn" : ""}
                  {seat.bidder === person.seat && seat.phase !== "bidding" ? " · Bidder" : ""}
                  {seat.revealedPartners.includes(person.seat) ? " · Partner" : ""}
                </p>
                <p>{cardsRemaining(seat.completedTricks, played)} cards</p>
                {bid ? <p>{bid}</p> : null}
              </li>
            )
          })}
        </ol>
        <section data-testid="current-trick" className="rounded-3xl bg-black/25 px-3 py-3" aria-label="Current trick">
          <p className="text-lg">
            {seat.trickNumber ? `Trick ${seat.trickNumber} of ${TRICKS}` : "Trick"}
          </p>
          {seat.currentTrick.length === 0 && seat.completedTricks > 0 && seat.leader !== null ? (
            <p>{seatName(view, seat.leader)} won the trick.</p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {seat.currentTrick.map((play) => (
              <li key={`${play.seat}${play.card.suit}${play.card.rank}${play.card.copy}`} data-testid="trick-card">
                {seatName(view, play.seat)} played {cardName(play.card)}
              </li>
            ))}
          </ul>
        </section>
        {seat.phase === "bidding" ? (
          <BiddingPanel
            playerCount={seat.playerCount}
            highBid={seat.highBid}
            highBidderName={seat.highBidder === null ? null : seatName(view, seat.highBidder)}
            dealer={seat.dealer}
            you={view.you.seat}
            toAct={seat.toAct}
            legal={legal}
            onPass={() => onSend({ type: "pass" })}
            onBid={(amount) => onSend({ type: "place_bid", amount })}
          />
        ) : null}
        {seat.phase === "call" ? (
          <CallPanel
            calls={legal?.calls ?? null}
            waitingFor={seat.bidder === null ? null : seatName(view, seat.bidder)}
            onCall={(card) => onSend({ type: "call_card", suit: card.suit, rank: card.rank })}
          />
        ) : null}
        <HandRack
          hand={seat.hand}
          legalPlays={seat.phase === "play" ? legal?.plays ?? null : null}
          lead={lead}
          confirm={confirm}
          onPlay={(card) => onSend({ type: "play_card", suit: card.suit, rank: card.rank, deckIndex: card.copy })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <RulesDrawer />
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(event) => {
                saveConfirmPlay(event.target.checked)
                setConfirm(event.target.checked)
              }}
            />
            Confirm before playing a card
          </label>
          {host ? (
            <Button type="button" variant="quiet" className="min-h-11 px-3 text-base" onClick={() => setMenuOpen(true)}>
              Host menu
            </Button>
          ) : null}
        </div>
      </div>
      {view.status === "paused" ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-felt/90 px-4" role="dialog" aria-label="Match paused">
          <div className="flex max-w-sm flex-col gap-3 rounded-3xl bg-felt-deep px-4 py-5">
            <h2 className="font-display text-4xl">Match paused</h2>
            <p>Waiting for the host to resume.</p>
            {host ? (
              <Button type="button" onClick={() => onSend({ type: "resume_match" })}>
                Resume
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {menuOpen ? (
        <div role="dialog" aria-label="Host menu" className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 px-4">
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-3xl bg-felt-deep px-4 py-5">
            <h2 className="font-display text-3xl">Host menu</h2>
            {confirmEnd ? (
              <>
                <p>End the match now? The standings decide the winners.</p>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    onSend({ type: "end_match" })
                    setConfirmEnd(false)
                    setMenuOpen(false)
                  }}
                >
                  End match
                </Button>
                <Button type="button" variant="quiet" onClick={() => setConfirmEnd(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {view.status === "playing" ? (
                  <Button type="button" variant="quiet" onClick={() => onSend({ type: "pause_match" })}>
                    Pause
                  </Button>
                ) : null}
                {view.status === "paused" ? (
                  <Button type="button" onClick={() => onSend({ type: "resume_match" })}>
                    Resume
                  </Button>
                ) : null}
                <Button type="button" variant="danger" onClick={() => setConfirmEnd(true)}>
                  End match
                </Button>
                <Button type="button" variant="quiet" onClick={() => setMenuOpen(false)}>
                  Close
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </Frame>
  )
}

function PartnerBanners({ names, reduce }: { names: string[]; reduce: boolean }) {
  if (names.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {names.map((name) =>
        reduce ? (
          <p key={name} role="status" data-testid="partner-banner" className="rounded-2xl bg-gold px-3 py-2 text-lg font-semibold text-ink">
            {name} is a partner
          </p>
        ) : (
          <motion.p
            key={name}
            role="status"
            data-testid="partner-banner"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-gold px-3 py-2 text-lg font-semibold text-ink"
          >
            {name} is a partner
          </motion.p>
        ),
      )}
    </div>
  )
}

function Frame({
  reconnecting,
  notice,
  children,
}: {
  reconnecting: boolean
  notice: string | null
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-5xl flex-col gap-2 overflow-hidden px-2 py-2 sm:px-6">
      {reconnecting ? (
        <p role="status" className="rounded-2xl bg-black/30 px-3 py-2 text-lg">
          Connection lost. Reconnecting…
        </p>
      ) : null}
      {notice ? (
        <p role="alert" className="rounded-2xl bg-black/30 px-3 py-2 text-lg">
          {notice}
        </p>
      ) : null}
      {children}
    </main>
  )
}

function seatName(view: RoomView, seat: number): string {
  return view.seats.find((item) => item.seat === seat)?.name ?? `Seat ${seat + 1}`
}
