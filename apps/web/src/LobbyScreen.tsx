import { motion, useReducedMotion } from "motion/react"
import type { RoomView } from "../../server/src/lobby.ts"
import { RoundsPicker } from "./RoundsPicker.tsx"
import { SharePanel } from "./SharePanel.tsx"
import { tableSizeLine } from "./table.ts"
import { Button, Screen } from "./ui.tsx"

export function LobbyScreen({
  view,
  reconnecting,
  notice,
  requestedName,
  onMove,
  onRemove,
  onRounds,
  onStart,
}: {
  view: RoomView
  reconnecting: boolean
  notice: string | null
  requestedName: string
  onMove: (from: number, to: number) => void
  onRemove: (seat: number) => void
  onRounds: (rounds: number) => void
  onStart: () => void
}) {
  const reduce = useReducedMotion() === true
  const host = view.you.seat === view.hostSeat
  const count = view.seats.length
  return (
    <Screen>
      <header className="flex flex-col gap-2">
        <p className="text-sm tracking-[0.2em] uppercase">Hidden Partner</p>
        <h1 className="font-display text-4xl">Lobby</h1>
      </header>
      {reconnecting ? (
        <p role="status" className="rounded-2xl bg-black/30 px-4 py-3 text-lg">
          Connection lost. Reconnecting…
        </p>
      ) : null}
      {notice ? (
        <p role="alert" className="rounded-2xl bg-black/30 px-4 py-3 text-lg">
          {notice}
        </p>
      ) : null}
      {requestedName && requestedName !== view.you.name ? (
        <p className="text-lg">You're seated as {view.you.name}.</p>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <section className="flex flex-col gap-4">
          <p data-testid="table-size" aria-live="polite" className="text-lg">
            {tableSizeLine(count)}
          </p>
          <h2 className="font-display text-2xl">Players</h2>
          <ol data-testid="player-list" className="flex flex-col gap-2">
            {view.seats.map((seat) => {
              const isHostSeat = seat.seat === view.hostSeat
              return (
                <li
                  key={seat.name}
                  draggable={host}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", String(seat.seat))
                    event.dataTransfer.effectAllowed = "move"
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const from = Number(event.dataTransfer.getData("text/plain"))
                    if (Number.isInteger(from) && from !== seat.seat) onMove(from, seat.seat)
                  }}
                  className="rounded-2xl bg-black/20"
                >
                  <motion.div
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-wrap items-center gap-3 px-3 py-3"
                  >
                  <span className="w-8 text-center text-lg font-semibold">{seat.seat + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold">{seat.name}</p>
                    <p className="text-base">
                      <span
                        aria-hidden="true"
                        className={`mr-2 inline-block size-2 rounded-full ${seat.connected ? "bg-gold" : "bg-cream/50"}`}
                      />
                      {seat.connected ? "Online" : "Offline"}
                      {isHostSeat ? " · Host" : ""}
                    </p>
                  </div>
                  {host ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="quiet"
                        className="min-h-11 px-3 text-base"
                        disabled={seat.seat === 0 || reconnecting}
                        aria-label={`Move ${seat.name} up`}
                        onClick={() => onMove(seat.seat, seat.seat - 1)}
                      >
                        Up
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        className="min-h-11 px-3 text-base"
                        disabled={seat.seat === count - 1 || reconnecting}
                        aria-label={`Move ${seat.name} down`}
                        onClick={() => onMove(seat.seat, seat.seat + 1)}
                      >
                        Down
                      </Button>
                      {isHostSeat ? null : (
                        <Button
                          type="button"
                          variant="danger"
                          className="min-h-11 px-3 text-base"
                          disabled={reconnecting}
                          aria-label={`Remove ${seat.name}`}
                          onClick={() => onRemove(seat.seat)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ) : null}
                  </motion.div>
                </li>
              )
            })}
          </ol>
          {host ? (
            <RoundsPicker value={view.rounds} disabled={reconnecting} onChange={onRounds} />
          ) : (
            <p className="text-lg">{view.rounds} rounds</p>
          )}
          {host ? (
            <Button type="button" disabled={count < 5 || count > 9 || reconnecting} onClick={onStart}>
              Start match
            </Button>
          ) : (
            <p className="text-lg">Waiting for host to start</p>
          )}
        </section>
        <SharePanel code={view.code} />
      </div>
    </Screen>
  )
}
