import { TRICKS } from "@hidden-partner/rules"
import type { RoomView } from "../../../server/src/lobby.ts"
import { cardName, delta, points } from "./labels.ts"
import { Button } from "../ui.tsx"

export function RoundResult({
  view,
  onNext,
}: {
  view: RoomView
  onNext: () => void
}) {
  const game = view.game
  const result = game?.seat.result
  if (!game || !result) return null
  const name = (seat: number) => view.seats.find((item) => item.seat === seat)?.name ?? `Seat ${seat + 1}`
  const team = [result.bidder, ...result.partners]
  const host = view.you.seat === view.hostSeat
  return (
    <section data-testid="round-result" className="flex flex-col gap-3">
      <h1 className="font-display text-4xl">Round result</h1>
      <p>
        Bid {points(result.bid)} by {name(result.bidder)}. {result.made ? "Made." : "Bust."}
      </p>
      <p>Called card {cardName(result.calledCard)}.</p>
      <p>Team: {team.map(name).join(", ")}.</p>
      <p>
        Team points {points(result.teamPoints)}. Others {points(result.othersPoints)}.
      </p>
      <ul className="flex flex-col gap-1">
        {result.scoreChanges.map((change, seat) => (
          <li key={seat}>
            {name(seat)} {delta(change)}
          </li>
        ))}
      </ul>
      <Leaderboard view={view} />
      {host ? (
        <Button type="button" data-testid="next-round" data-legal="true" onClick={onNext}>
          Next round
        </Button>
      ) : (
        <p>Waiting for host</p>
      )}
      <p className="text-base">Round {game.roundNumber} of {view.rounds}. {TRICKS} tricks played.</p>
    </section>
  )
}

export function FinalScreen({ view, onHome }: { view: RoomView; onHome: () => void }) {
  const game = view.game
  const names = (game?.winners ?? []).map(
    (seat) => view.seats.find((item) => item.seat === seat)?.name ?? `Seat ${seat + 1}`,
  )
  return (
    <section data-testid="final-screen" className="flex flex-col gap-4">
      <h1 className="font-display text-5xl">Match over</h1>
      {names.length > 1 ? <p className="text-2xl">Co-winners: {names.join(", ")}.</p> : null}
      {names.length === 1 ? <p className="text-2xl">Winner: {names[0]}.</p> : null}
      {game?.seat.result ? (
        <p>
          Last bid {points(game.seat.result.bid)} was {game.seat.result.made ? "made" : "a bust"}.
        </p>
      ) : null}
      <Leaderboard view={view} />
      <Button type="button" onClick={onHome}>
        Back to home
      </Button>
    </section>
  )
}

export function Leaderboard({ view }: { view: RoomView }) {
  const rows = view.game?.leaderboard ?? []
  return (
    <ol data-testid="leaderboard" className="flex flex-col gap-1 text-lg">
      {rows.map((row) => (
        <li key={row.seat}>
          {row.name} {points(row.total)}
        </li>
      ))}
    </ol>
  )
}
