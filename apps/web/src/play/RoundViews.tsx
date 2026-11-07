import { TRICKS } from "@hidden-partner/rules"
import type { RoomView } from "../../../server/src/lobby.ts"
import { cardName, delta, points } from "./labels.ts"
import { Button } from "../ui.tsx"

export function RoundResult({
  view,
  onNext,
  onHome,
  final = false,
}: {
  view: RoomView
  onNext?: () => void
  onHome?: () => void
  final?: boolean
}) {
  const game = view.game
  const result = game?.seat.result
  if (!game || !result) return null
  const name = (seat: number) => view.seats.find((item) => item.seat === seat)?.name ?? `Seat ${seat + 1}`
  const host = view.you.seat === view.hostSeat
  const winners = (game.winners ?? []).map(name)
  const partners = result.partners.map(name)
  return (
    <section data-testid="round-result" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <h1 className="font-display text-4xl">{final ? "Match over" : "Round result"}</h1>
      <section className="flex flex-col gap-1">
        <h2 className="font-display text-2xl">This round</h2>
        <p>
          Bid {points(result.bid)} by {name(result.bidder)}. {result.made ? "Bid made" : "Bid not made"}.
        </p>
        <p>Bidder {name(result.bidder)}. Partners {partners.length > 0 ? partners.join(", ") : "none"}.</p>
        <p>Partner Card {cardName(result.calledCard)}.</p>
        <p>
          Team points {points(result.teamPoints)} against the bid of {points(result.bid)}. Others {points(result.othersPoints)}.
        </p>
      </section>
      <Leaderboard view={view} />
      {final && winners.length > 1 ? <p className="text-2xl">Co-winners: {winners.join(", ")}.</p> : null}
      {final && winners.length === 1 ? <p className="text-2xl">Winner: {winners[0]}.</p> : null}
      {final && onHome ? (
        <Button type="button" onClick={onHome}>
          Back to home
        </Button>
      ) : null}
      {!final && host && onNext ? (
        <Button type="button" data-testid="next-round" data-legal="true" onClick={onNext}>
          Next round
        </Button>
      ) : null}
      {!final && !host ? <p>Waiting for host</p> : null}
      <p className="text-base">
        Round {game.roundNumber} of {view.rounds}. {TRICKS} hands played.
      </p>
    </section>
  )
}

export function FinalScreen({ view, onHome }: { view: RoomView; onHome: () => void }) {
  const game = view.game
  const names = (game?.winners ?? []).map(
    (seat) => view.seats.find((item) => item.seat === seat)?.name ?? `Seat ${seat + 1}`,
  )
  return (
    <section data-testid="final-screen" aria-live="polite" className="flex flex-col gap-4">
      <h1 className="font-display text-5xl">Match over</h1>
      {names.length > 1 ? <p className="text-2xl">Co-winners: {names.join(", ")}.</p> : null}
      {names.length === 1 ? <p className="text-2xl">Winner: {names[0]}.</p> : null}
      <Leaderboard view={view} />
      <Button type="button" onClick={onHome}>
        Back to home
      </Button>
    </section>
  )
}

export function Leaderboard({ view }: { view: RoomView }) {
  const rows = [...(view.game?.leaderboard ?? [])].sort((a, b) => b.total - a.total || a.seat - b.seat)
  const changes = view.game?.seat.result?.scoreChanges
  const ranked = rows.map((row, index) => ({
    row,
    rank: index === 0 || row.total < rows[index - 1]!.total ? index + 1 : 0,
  }))
  let rank = 1
  for (const item of ranked) {
    if (item.rank === 0) item.rank = rank
    else rank = item.rank
  }
  return (
    <section className="flex flex-col gap-1">
      <h2 className="font-display text-2xl">Leaderboard</h2>
      <table data-testid="leaderboard" className="w-full border-collapse text-left text-base">
        <thead>
          <tr>
            <th className="py-1 pr-2 font-semibold">Rank</th>
            <th className="py-1 pr-2 font-semibold">Player</th>
            <th className="py-1 pr-2 font-semibold">Total</th>
            <th className="py-1 font-semibold">Change</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(({ rank: place, row }) => {
            const change = changes?.[row.seat]
            const you = row.seat === view.you.seat
            return (
              <tr key={row.seat}>
                <td className="py-1 pr-2">{place}</td>
                <td className="py-1 pr-2">
                  {row.name}
                  {you ? " (you)" : ""}
                </td>
                <td className="py-1 pr-2">{points(row.total)}</td>
                <td className="py-1">{change === undefined ? "" : delta(change)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
