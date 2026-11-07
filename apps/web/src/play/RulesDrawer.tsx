import { useState } from "react"
import { Button } from "../ui.tsx"

export function RulesDrawer() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <Button type="button" variant="quiet" className="min-h-11 px-3 text-base" onClick={() => setOpen(true)}>
        Rules
      </Button>
      {open ? (
        <div role="dialog" aria-label="Rules" className="fixed inset-0 z-30 overflow-y-auto bg-felt px-4 py-6 text-cream">
          <div className="mx-auto flex max-w-lg flex-col gap-4">
            <h2 className="font-display text-4xl">Rules</h2>
            <section className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold">Bidding</h3>
              <p>
                Bidding starts with the player beside the dealer and goes clockwise. The first bid is the opening bid
                for this table size. Later bids raise it by 10 or 50, up to 2,520. A pass is final. If everyone else
                passes, the dealer must open at the floor. The highest bidder names the called card.
              </p>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold">The call</h3>
              <p>
                The bidder names a 10, jack, queen, king, or ace from their hand, and they must hold one or two copies
                of it, never all three. That suit is trump.
              </p>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold">Partners</h3>
              <p>
                Whoever else holds the called card is the bidder's secret partner. Partners are announced when they play
                it, not before. The bidder's own copies are not announced.
              </p>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold">Play and scoring</h3>
              <p>
                Follow the suit that was led when you can. You never have to play trump. The highest trump wins the
                trick, or the highest card of the led suit if there is no trump. The later identical card wins a tie.
                There are 12 tricks. The bidder's team makes the bid when the points in its tricks reach the bid. Scores
                change by the bid, and they are shown only after the round.
              </p>
            </section>
            <Button type="button" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
