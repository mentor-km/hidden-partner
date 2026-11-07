import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import { TRICKS, bidFloor } from "@hidden-partner/rules"
import type { PlayedCard } from "@hidden-partner/rules"
import type { ClientMessage } from "../../../server/src/messages.ts"
import type { RoomView } from "../../../server/src/lobby.ts"
import { BiddingPanel } from "./BiddingPanel.tsx"
import { CallPanel } from "./CallPanel.tsx"
import { CardFace } from "./CardFace.tsx"
import { HandRack } from "./HandRack.tsx"
import { cardName, cardsRemaining, lastBidText, points, sameCard, suitName } from "./labels.ts"
import { FinalScreen, RoundResult } from "./RoundViews.tsx"
import { RulesDrawer } from "./RulesDrawer.tsx"
import { armAudio, loadMuted, playSound, saveMuted } from "./sounds.ts"
import { addToast, Toasts } from "./Toasts.tsx"
import type { ToastNote } from "./Toasts.tsx"
import { Button } from "../ui.tsx"

export function TableScreen({
  view,
  reconnecting,
  notice,
  onSend,
  onHome,
  onRetry,
}: {
  view: RoomView
  reconnecting: boolean
  notice: string | null
  onSend: (message: ClientMessage) => void
  onHome: () => void
  onRetry?: () => void
}) {
  const game = view.game
  const [muted, setMuted] = useState(loadMuted)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [notes, setNotes] = useState<ToastNote[]>([])
  const [held, setHeld] = useState<{ plays: PlayedCard[]; winner: number; trickNumber: number } | null>(null)
  const [playersOpen, setPlayersOpen] = useState(false)
  const sendRef = useRef(onSend)
  sendRef.current = onSend
  const seenPartners = useRef<{ round: number; seats: Set<number> } | null>(null)
  const lastTrick = useRef<{ plays: PlayedCard[]; trickNumber: number; consumed: boolean } | null>(null)
  const heard = useRef<{ toAct: number | null; trickLen: number; completed: number; partners: number; phase: string } | null>(null)
  const host = view.you.seat === view.hostSeat
  const reduce = useReducedMotion() === true

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const previousRoot = root.style.overflow
    const previousBody = body.style.overflow
    root.style.overflow = "hidden"
    body.style.overflow = "hidden"
    return () => {
      root.style.overflow = previousRoot
      body.style.overflow = previousBody
    }
  }, [])

  useEffect(() => {
    const arm = () => armAudio()
    window.addEventListener("pointerdown", arm)
    window.addEventListener("keydown", arm)
    return () => {
      window.removeEventListener("pointerdown", arm)
      window.removeEventListener("keydown", arm)
    }
  }, [])

  useEffect(() => {
    if (!game) return
    const seat = game.seat
    const next = {
      toAct: seat.toAct,
      trickLen: seat.currentTrick.length,
      completed: seat.completedTricks,
      partners: seat.revealedPartners.length,
      phase: seat.phase,
    }
    const previous = heard.current
    heard.current = next
    if (!previous) return
    if (seat.toAct === view.you.seat && previous.toAct !== seat.toAct) playSound("turn")
    if (next.trickLen > previous.trickLen || next.completed > previous.completed) playSound("card")
    if (next.partners > previous.partners) playSound("partner")
    if (next.phase === "scored" && previous.phase !== "scored") playSound("round")
  }, [game, view.you.seat])

  useEffect(() => {
    if (!game || game.seat.phase !== "play") {
      setHeld(null)
      return
    }
    const trick = game.seat.currentTrick
    if (trick.length > 0) {
      lastTrick.current = {
        plays: trick,
        trickNumber: game.seat.trickNumber ?? game.seat.completedTricks + 1,
        consumed: false,
      }
      setHeld(null)
      return
    }
    const previous = lastTrick.current
    if (!previous || previous.consumed || previous.plays.length === 0 || game.seat.leader === null) return
    previous.consumed = true
    setHeld({ plays: previous.plays, winner: game.seat.leader, trickNumber: previous.trickNumber })
    const timer = window.setTimeout(() => setHeld(null), reduce ? 0 : 1000)
    return () => window.clearTimeout(timer)
  }, [game, reduce])

  useEffect(() => {
    if (!game) return
    const revealed = game.seat.revealedPartners.filter((seat) => seat !== game.seat.bidder)
    const seen = seenPartners.current
    if (!seen || seen.round !== game.roundNumber) {
      seenPartners.current = { round: game.roundNumber, seats: new Set(revealed) }
      setNotes((current) => current.filter((item) => !item.id.startsWith("partner-")))
      return
    }
    const fresh = revealed.filter((seat) => !seen.seats.has(seat))
    if (fresh.length === 0) return
    const bidder = game.seat.bidder
    const bidderName = bidder === null ? "the bidder" : seatName(view, bidder)
    for (const seat of fresh) seen.seats.add(seat)
    setNotes((current) =>
      fresh.reduce(
        (notes, seat) =>
          addToast(notes, {
            id: `partner-${game.roundNumber}-${seat}`,
            text: `${seatName(view, seat)} is ${bidderName}'s partner`,
            kind: "timed",
            testId: "partner-banner",
          }),
        current,
      ),
    )
  }, [game, view])

  useEffect(() => {
    if (!notice) return
    setNotes((current) =>
      addToast(current, { id: `notice-${notice}`, text: notice, kind: "timed", testId: "notice-toast" }),
    )
  }, [notice])

  useEffect(() => {
    if (!reconnecting) {
      setNotes((current) => current.filter((item) => item.id !== "reconnecting"))
      return
    }
    setNotes((current) =>
      addToast(current, {
        id: "reconnecting",
        text: "Connection lost. Reconnecting…",
        kind: "stay",
        testId: "reconnecting-toast",
        actionLabel: onRetry ? "Retry" : undefined,
      }),
    )
  }, [reconnecting, onRetry])

  useEffect(() => {
    if (!game || view.status !== "playing" || reconnecting) return
    const seat = game.seat
    if (seat.phase !== "play" || seat.toAct !== view.you.seat || seat.hand.length !== 1) return
    const handNumber = seat.trickNumber ?? seat.completedTricks + 1
    if (handNumber !== 12) return
    const card = seat.hand[0]
    const legal = game.legal?.plays ?? null
    if (!card || !legal?.some((play) => sameCard(card, play))) return
    const storageKey = `hp.autoplay.${view.code}.${game.roundNumber}.${card.suit}.${card.rank}.${card.copy}`
    if (sessionStorage.getItem(storageKey)) return
    const timer = window.setTimeout(() => {
      if (sessionStorage.getItem(storageKey)) return
      sessionStorage.setItem(storageKey, "1")
      sendRef.current({ type: "play_card", suit: card.suit, rank: card.rank, deckIndex: card.copy })
      setNotes((current) =>
        addToast(current, {
          id: `auto-${storageKey}`,
          text: "Last card played automatically",
          kind: "timed",
          testId: "auto-play",
        }),
      )
    }, 1_000)
    return () => window.clearTimeout(timer)
  }, [game, reconnecting, view.code, view.status, view.you.seat])

  const frame = {
    onRetry,
    muted,
    notes,
    onDismiss: (id: string) => setNotes((current) => current.filter((item) => item.id !== id)),
    onMute: () => {
      const next = !muted
      saveMuted(next)
      setMuted(next)
    },
  }

  if (!game) {
    return (
      <Frame {...frame}>
        <div role="status" className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="spinner" aria-hidden="true" />
          <p>Waiting for the deal.</p>
        </div>
      </Frame>
    )
  }
  if (view.status === "finished" && game.seat.result) {
    return (
      <Frame {...frame}>
        <RoundResult view={view} final onHome={onHome} />
      </Frame>
    )
  }
  if (view.status === "finished") {
    return (
      <Frame {...frame}>
        <FinalScreen view={view} onHome={onHome} />
      </Frame>
    )
  }
  if (game.seat.phase === "scored") {
    return (
      <Frame {...frame}>
        <RoundResult view={view} onNext={() => onSend({ type: "next_round" })} />
      </Frame>
    )
  }

  const seat = game.seat
  const legal = view.status === "playing" ? game.legal : null
  const actor = seat.toAct === null ? null : view.seats.find((item) => item.seat === seat.toAct)
  const status = actor ? (actor.seat === view.you.seat ? "Your turn" : `Waiting for ${actor.name}`) : "Waiting"
  const lead = seat.currentTrick[0]?.card.suit ?? null
  const youPlayed = seat.currentTrick.some((play) => play.seat === view.you.seat)
  const ledByOther = seat.currentTrick[0] !== undefined && seat.currentTrick[0].seat !== view.you.seat
  const holdsLead = lead !== null && seat.hand.some((card) => card.suit === lead)
  const follow =
    seat.phase === "play" && ledByOther && !youPlayed && holdsLead && actor?.seat !== view.you.seat
      ? `You must follow ${suitName(lead)}`
      : null
  const shown =
    seat.currentTrick.length > 0
      ? { plays: seat.currentTrick, winner: null as number | null, trickNumber: seat.trickNumber }
      : held
  const snapshot = [
    seat.phase,
    seat.toAct ?? "-",
    seat.currentTrick.length,
    seat.completedTricks,
    seat.hand.length,
    seat.highBid ?? "-",
    seat.calledCard ? `${seat.calledCard.suit}${seat.calledCard.rank}` : "-",
  ].join(":")

  const handNumber = shown?.trickNumber ?? seat.trickNumber ?? seat.completedTricks + 1
  const handsPlayed = seat.completedTricks === 1 ? "1 hand played" : `${seat.completedTricks} hands played`

  return (
    <Frame
      {...frame}
      notes={notes}
      onDismiss={(id) => setNotes((current) => current.filter((item) => item.id !== id))}
      scroll={false}
      onPlayers={() => setPlayersOpen(true)}
      leading={
        <div data-testid="your-seat" className="min-w-0">
          <p className="truncate text-base font-semibold">You: {view.you.name}</p>
          <h1 className="truncate text-sm font-normal">
            Seat {view.you.seat + 1} · Round {game.roundNumber}
          </h1>
        </div>
      }
      tools={
        <>
          <RulesDrawer />
          {host ? (
            <Button type="button" variant="quiet" className="px-2 text-sm" onClick={() => setMenuOpen(true)}>
              Host menu
            </Button>
          ) : null}
        </>
      }
    >
      <LayoutGroup>
        <div data-testid="table" data-phase={seat.phase} data-snapshot={snapshot} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SeatStrip
            view={view}
            justPlayed={seat.currentTrick.at(-1)?.seat ?? held?.plays.at(-1)?.seat ?? null}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {seat.phase === "bidding" ? <Auction view={view} /> : null}
            {seat.phase === "play" ? (
              <section data-testid="current-trick" className="rounded-3xl bg-black/25 px-3 py-2" aria-label="Current hand">
                <p className="text-lg">
                  Hand {handNumber} of {TRICKS}
                </p>
                {shown && shown.plays.length > 0 ? (
                  <ul className="flex flex-wrap items-end justify-center gap-2">
                    {shown.plays.map((play) => {
                      const won = shown.winner === play.seat
                      const flight = `card-${play.card.suit}-${play.card.rank}-${play.card.copy}`
                      const who = play.seat === view.you.seat ? "You" : seatName(view, play.seat)
                      return (
                        <li
                          key={flight}
                          data-testid="trick-card"
                          data-winner={won ? "true" : "false"}
                          className={`flex w-16 flex-col items-center gap-1 ${won ? "rounded-xl ring-2 ring-gold" : ""}`}
                        >
                          <motion.span layoutId={reduce ? undefined : flight} className="flex w-full">
                            <CardFace rank={play.card.rank} suit={play.card.suit} large />
                          </motion.span>
                          <span className="max-w-full truncate text-center text-sm">
                            {won ? `${who} won this hand` : who}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : seat.completedTricks > 0 ? (
                  <p>
                    {handsPlayed}
                    {seat.leader !== null
                      ? `. ${seat.leader === view.you.seat ? "You" : seatName(view, seat.leader)} won this hand`
                      : ""}
                  </p>
                ) : (
                  <p>No card played yet.</p>
                )}
              </section>
            ) : null}
          </div>
          <div className="shrink-0">
            <p data-testid="turn-line" aria-live="polite" className="text-base font-semibold">
              {status}
            </p>
            {follow ? (
              <p data-testid="follow-suit" className="text-sm font-semibold">
                {follow}
              </p>
            ) : null}
            {seat.bid !== null && seat.bidder !== null ? (
              <p className="text-sm">
                {seatName(view, seat.bidder)} bid {points(seat.bid)}.
              </p>
            ) : null}
            {seat.calledCard ? (
              <p data-testid="trump-line" className="text-sm">
                Trump is {suitName(seat.calledCard.suit)}. Partner Card: {cardName(seat.calledCard)}.
              </p>
            ) : null}
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
                compact
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
              onPlay={(card) => onSend({ type: "play_card", suit: card.suit, rank: card.rank, deckIndex: card.copy })}
              onReason={(text) =>
                setNotes((current) => addToast(current, { id: `reason-${text}`, text, kind: "timed", testId: "card-reason" }))
              }
            />
          </div>
        </div>
      </LayoutGroup>
      {playersOpen ? <PlayersSheet view={view} onClose={() => setPlayersOpen(false)} /> : null}
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

function SeatStrip({ view, justPlayed }: { view: RoomView; justPlayed: number | null }) {
  const seat = view.game?.seat
  const stripRef = useRef<HTMLOListElement>(null)
  const reduce = useReducedMotion() === true
  const toAct = seat?.toAct ?? null
  useEffect(() => {
    const container = stripRef.current
    if (!container) return
    const align = () => alignStrip(container, justPlayed, reduce)
    align()
    const frame = window.requestAnimationFrame(align)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => align())
    observer?.observe(container)
    window.addEventListener("resize", align)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener("resize", align)
    }
  }, [toAct, justPlayed, reduce, view.seats.length])
  if (!seat) return null
  return (
    <ol
      ref={stripRef}
      data-testid="seats"
      data-just-played={justPlayed === null ? undefined : justPlayed}
      className="relative flex w-full shrink-0 gap-1 overflow-x-auto pb-1"
    >
      {view.seats.map((person) => (
        <SeatCard key={person.seat} view={view} person={person} compact />
      ))}
    </ol>
  )
}

function alignStrip(container: HTMLElement, justPlayed: number | null, reduce: boolean) {
  const turn = container.querySelector<HTMLElement>("[data-turn='true']")
  if (!turn) return
  const played = justPlayed === null ? null : container.querySelector<HTMLElement>(`[data-seat="${justPlayed}"]`)
  const nodes = played && played !== turn ? [turn, played] : [turn]
  const width = container.clientWidth
  if (width <= 0) return
  const origin = container.getBoundingClientRect().left
  const boxes = nodes.map((node) => {
    const box = node.getBoundingClientRect()
    const left = box.left - origin + container.scrollLeft
    return { left, right: left + box.width }
  })
  const min = Math.min(...boxes.map((box) => box.left))
  const max = Math.max(...boxes.map((box) => box.right))
  const pad = 2
  let left = container.scrollLeft
  if (max - min + pad * 2 <= width) {
    if (min - pad < left) left = min - pad
    else if (max + pad > left + width) left = max + pad - width
  } else {
    const focus = boxes[0]!
    if (focus.left < left) left = focus.left
    else if (focus.right > left + width) left = focus.right - width
  }
  left = Math.max(0, left)
  if (Math.abs(left - container.scrollLeft) < 1) return
  container.scrollLeft = left
  if (reduce) return
  try {
    container.scrollTo({ left, behavior: "smooth" })
  } catch {
    container.scrollLeft = left
  }
}

function PlayersSheet({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  return (
    <div
      data-testid="players-backdrop"
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Players"
        aria-modal="true"
        data-testid="players-sheet"
        className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-felt-deep px-4 py-4 sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-3xl">Players</h2>
          <Button type="button" variant="quiet" className="min-h-11 px-3" onClick={onClose} autoFocus>
            Close
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {view.seats.map((person) => (
            <li key={person.seat}>
              <SeatCard view={view} person={person} compact={false} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SeatCard({
  view,
  person,
  compact,
}: {
  view: RoomView
  person: RoomView["seats"][number]
  compact: boolean
}) {
  const seat = view.game?.seat
  if (!seat) return null
  const played = seat.currentTrick.some((play) => play.seat === person.seat)
  const bidding = seat.phase === "bidding"
  const bid = bidding ? lastBidText(seat.passed[person.seat] ?? false, seat.bids, person.seat) : null
  const turn = person.seat === seat.toAct
  return (
    <div
      data-testid={compact ? "seat" : "player-row"}
      data-seat={person.seat}
      data-turn={turn ? "true" : "false"}
      className={
        compact
          ? `w-[5.5rem] shrink-0 rounded-xl px-1 py-1 text-xs leading-tight ${
              turn ? "bg-gold/20 ring-2 ring-gold" : "bg-black/20"
            }`
          : `rounded-2xl px-3 py-2 ${turn ? "bg-gold/20 ring-2 ring-gold" : "bg-black/20"}`
      }
    >
      <p className={compact ? "truncate font-semibold" : "text-lg font-semibold"}>
        {person.name}
        {person.seat === view.you.seat ? " (you)" : ""}
      </p>
      <p className={person.connected ? "text-[#8dffa8]" : "text-[#ff8d8d]"}>
        <span
          aria-hidden="true"
          className={`mr-1 inline-block size-2 ${
            person.connected ? "rounded-full bg-[#3ddc84]" : "rounded-sm bg-[#ff5a5a]"
          }`}
        />
        {person.connected ? "Online" : "Offline"}
      </p>
      <p className="flex flex-col">
        {turn ? (
          <span data-testid="turn-chip" className="w-fit rounded bg-gold px-1 text-ink">
            Turn
          </span>
        ) : null}
        {person.seat === seat.dealer ? <span>Dealer</span> : null}
        {seat.bidder === person.seat && !bidding ? <span>Bidder</span> : null}
      </p>
      {seat.bidder === person.seat && !bidding && seat.bid !== null ? <p>Bid {points(seat.bid)}</p> : null}
      {bid ? <p>{bid}</p> : null}
      <p>{cardsRemaining(seat.completedTricks, played)} cards</p>
    </div>
  )
}

function Auction({ view }: { view: RoomView }) {
  const seat = view.game?.seat
  if (!seat) return null
  const passed = view.seats.filter((person) => seat.passed[person.seat])
  return (
    <section data-testid="auction" aria-label="Auction" className="rounded-3xl bg-black/25 px-3 py-2">
      <h2 className="text-base">Bidding</h2>
      {seat.bids.length === 0 && passed.length === 0 ? (
        <p className="text-sm">Opening bid {points(bidFloor(seat.playerCount))}. A pass is final for this round.</p>
      ) : null}
      <ol className="flex flex-col gap-1">
        {seat.bids.map((bid, index) => (
          <li key={`${bid.seat}-${bid.amount}-${index}`}>
            {seatName(view, bid.seat)} bid {points(bid.amount)}
          </li>
        ))}
        {passed.map((person) => (
          <li key={`pass-${person.seat}`}>{person.name} passed</li>
        ))}
      </ol>
    </section>
  )
}

function Frame({
  onRetry,
  muted,
  onMute,
  onPlayers,
  leading,
  tools,
  notes = [],
  onDismiss = () => {},
  scroll = true,
  children,
}: {
  onRetry?: () => void
  muted: boolean
  onMute: () => void
  onPlayers?: () => void
  leading?: ReactNode
  tools?: ReactNode
  notes?: ToastNote[]
  onDismiss?: (id: string) => void
  scroll?: boolean
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex h-dvh max-h-dvh min-h-0 w-full max-w-5xl flex-col overflow-hidden px-2 py-1">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1">
        <div className="min-w-36">
          {leading ?? <p className="text-sm tracking-[0.2em] uppercase">Hidden Partner</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {tools}
          {onPlayers ? (
            <Button
              type="button"
              variant="quiet"
              className="px-2 text-sm"
              data-testid="players-button"
              onClick={onPlayers}
            >
              Players
            </Button>
          ) : null}
          <Button type="button" variant="quiet" className="px-2 text-sm" aria-pressed={muted} onClick={onMute}>
            {muted ? "Unmute" : "Mute"}
          </Button>
        </div>
      </div>
      <div className={scroll ? "min-h-0 min-w-0 flex-1 overflow-y-auto" : "flex min-h-0 min-w-0 flex-1 flex-col"}>{children}</div>
      <Toasts items={notes} onDismiss={onDismiss} onAction={onRetry} />
    </main>
  )
}

function seatName(view: RoomView, seat: number): string {
  return view.seats.find((item) => item.seat === seat)?.name ?? `Seat ${seat + 1}`
}
