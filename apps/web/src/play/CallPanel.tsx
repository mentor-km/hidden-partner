import type { Rank, Suit } from "@hidden-partner/rules"
import { cardName } from "./labels.ts"
import { Button } from "../ui.tsx"

export function CallPanel({
  calls,
  waitingFor,
  onCall,
}: {
  calls: { suit: Suit; rank: Rank }[] | null
  waitingFor: string | null
  onCall: (card: { suit: Suit; rank: Rank }) => void
}) {
  if (!calls) {
    return <p className="text-lg">Waiting for {waitingFor ?? "the bidder"} to name the called card.</p>
  }
  return (
    <section className="flex flex-col gap-2" aria-label="Call a card">
      <h2 className="font-display text-2xl">Name the called card</h2>
      {calls.length === 0 ? <p>No card can be called. The round will be dealt again.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        {calls.map((card) => (
          <Button
            key={`${card.suit}${card.rank}`}
            type="button"
            variant="quiet"
            data-testid="call-card"
            data-legal="true"
            data-suit={card.suit}
            data-rank={card.rank}
            onClick={() => onCall(card)}
          >
            {cardName(card)}
          </Button>
        ))}
      </div>
    </section>
  )
}
