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
                The opening bid depends on the player count. The floor is 1,570 at 5 players, 1,390 at 6, 1,260 at 7,
                1,140 at 8 and 1,050 at 9. The cap is 2,520.
              </p>
              <p>
                Bidding goes clockwise from the player next to the dealer. On their turn a player passes, opens at the
                floor for that player count if nobody has bid, or raises by +10 or +50. Buttons that would pass 2,520
                are off.
              </p>
              <p>A pass is final for the round.</p>
              <p>
                At least one bid must be made. If everyone before the last player passes, the last player must open at
                the floor for that player count. A single bid is enough: if one player bids and all others pass, that
                player is the Bidder.
              </p>
              <p>The auction ends when all but one player have passed, or at once if someone bids 2,520, since nobody can raise it.</p>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold">The call</h3>
              <p>
                The Bidder names one card from their own hand. It must be a 10, J, Q, K or A, and the Bidder must hold
                exactly 1 or 2 copies of it (never all 3, so there is no solo play).
              </p>
              <p>The suit of the Partner Card is trump for the round.</p>
              <p>
                The other holders of that card are the Bidder's secret partners: 1 or 2 players. Partners can see they
                hold the card. The Bidder does not know who they are.
              </p>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold">Partners</h3>
              <p>
                When a non-bidder plays the Partner Card, a toast says they are the Bidder's partner, for example "Cleo
                is Ava's partner". Each partner is announced once. The Bidder playing their own copy shows no toast.
              </p>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold">Scoring</h3>
              <p>
                The Bidder's team (the Bidder plus the partners) wins the round if the card points in the hands its
                members captured are at least the bid. Every player's score then changes by a multiple of the bid,
                called X.
              </p>
              <p>Bid made: Bidder +2X, each partner +1X, everyone else −1X.</p>
              <p>Bust, Bidder held 2 copies: Bidder −2X, each partner −1X, everyone else +1X.</p>
              <p>Bust, Bidder held 1 copy: Bidder −1X, each partner −1X, everyone else +1X.</p>
              <h3 className="text-xl font-semibold">Worked example</h3>
              <p>Worked examples with 7 players and X = 1,300:</p>
              <p>Bid made, Bidder held 1 copy, 2 partners: Bidder +2,600, each partner +1,300, each of the 4 others −1,300.</p>
              <p>Bust, Bidder held 2 copies, 1 partner: Bidder −2,600, the partner −1,300, each of the 5 others +1,300.</p>
              <p>Bust, Bidder held 1 copy, 2 partners: Bidder −1,300, each partner −1,300, each of the 4 others +1,300.</p>
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
