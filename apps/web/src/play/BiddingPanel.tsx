import { BID_CAP, bidFloor } from "@hidden-partner/rules"
import type { LegalChoices } from "../../../server/src/lobby.ts"
import { points } from "./labels.ts"
import { Button } from "../ui.tsx"

export function BiddingPanel({
  playerCount,
  highBid,
  highBidderName,
  dealer,
  you,
  toAct,
  legal,
  onPass,
  onBid,
}: {
  playerCount: number
  highBid: number | null
  highBidderName: string | null
  dealer: number
  you: number
  toAct: number | null
  legal: LegalChoices | null
  onPass: () => void
  onBid: (amount: number) => void
}) {
  const bids = legal?.bids ?? null
  const yourTurn = bids !== null && toAct === you
  const amounts = bids?.amounts ?? []
  const raiseTen = highBid === null ? null : highBid + 10
  const raiseFifty = highBid === null ? null : highBid + 50
  const can = (amount: number | null) => amount !== null && yourTurn && amounts.includes(amount)
  const opening = amounts.find((amount) => amount !== raiseTen && amount !== raiseFifty && amount !== BID_CAP) ?? null
  const mustOpen = yourTurn && dealer === you && highBid === null && bids?.pass === false

  return (
    <section className="flex flex-col gap-2" aria-label="Bidding">
      <p className="text-base">Opening bid {points(bidFloor(playerCount))}.</p>
      <p className="text-lg font-semibold">
        {highBid === null || !highBidderName
          ? "No bid yet."
          : `High bid ${points(highBid)} by ${highBidderName}.`}
      </p>
      {mustOpen ? (
        <p data-testid="must-open" className="text-base">
          You must open at {points(bidFloor(playerCount))}.
        </p>
      ) : null}
      <p className="text-base">A pass is final for this round.</p>
      <div className="grid grid-cols-2 gap-2">
        {opening !== null ? (
          <BidButton
            testId="bid-open"
            amount={opening}
            legal={can(opening)}
            label={`Open at ${points(opening)}`}
            onBid={onBid}
          />
        ) : null}
        <BidButton testId="bid-plus-10" amount={raiseTen} legal={can(raiseTen)} label="+10" onBid={onBid} />
        <BidButton testId="bid-plus-50" amount={raiseFifty} legal={can(raiseFifty)} label="+50" onBid={onBid} />
        <BidButton
          testId="bid-cap"
          amount={BID_CAP}
          legal={can(BID_CAP)}
          label={`Bid ${points(BID_CAP)}`}
          onBid={onBid}
        />
        <Button
          type="button"
          variant="quiet"
          data-testid="bid-pass"
          data-legal={yourTurn && bids?.pass ? "true" : "false"}
          disabled={!yourTurn || !bids?.pass}
          onClick={onPass}
        >
          Pass
        </Button>
      </div>
    </section>
  )
}

function BidButton({
  testId,
  amount,
  legal,
  label,
  onBid,
}: {
  testId: string
  amount: number | null
  legal: boolean
  label: string
  onBid: (amount: number) => void
}) {
  return (
    <Button
      type="button"
      variant="quiet"
      data-testid={testId}
      data-legal={legal ? "true" : "false"}
      data-amount={amount ?? undefined}
      disabled={!legal || amount === null}
      onClick={() => {
        if (amount !== null) onBid(amount)
      }}
    >
      {label}
    </Button>
  )
}
