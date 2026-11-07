import { bidFloor, legalBids, legalCalls, legalPlays } from "../src/index.ts"
import { apply, createRound } from "../src/server.ts"
import type { Action, Card, CardName, GameEvent, Rank, RoundState, Seed, Suit } from "../src/types.ts"

const SEED: Seed = [7, 11, 13, 17]
const PLAYERS = 7

const RANK_NAME: Record<Rank, string> = {
  A: "ace",
  K: "king",
  Q: "queen",
  J: "jack",
  "10": "10",
  "9": "9",
  "8": "8",
  "7": "7",
  "6": "6",
}
const SUIT_NAME: Record<Suit, string> = {
  C: "clubs",
  D: "diamonds",
  H: "hearts",
  S: "spades",
}

function count(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function cardText(card: Card | CardName): string {
  return `${RANK_NAME[card.rank]} of ${SUIT_NAME[card.suit]}`
}

function signed(value: number): string {
  if (value > 0) return `+${count(value)}`
  if (value < 0) return `-${count(Math.abs(value))}`
  return "0"
}

function step(state: RoundState, action: Action): { state: RoundState; events: GameEvent[] } {
  const result = apply(state, action)
  if (!result.ok) throw new Error(result.error)
  return { state: result.state, events: result.events }
}

function seatLabel(seat: number, dealer: number): string {
  return seat === dealer ? `Seat ${seat}, the dealer` : `Seat ${seat}`
}

let state = createRound({ playerCount: PLAYERS, dealer: 0, seed: SEED })
console.log(`Hidden Partner demo: ${PLAYERS} players, seed ${SEED.join(", ")}`)
console.log("")
console.log("Hands")
for (let seat = 0; seat < state.playerCount; seat += 1) {
  const hand = state.hands[seat] ?? []
  console.log(`${seatLabel(seat, state.dealer)}: ${hand.map(cardText).join(", ")}`)
}

console.log("")
console.log("Auction")
let raised = false
while (state.phase === "bidding") {
  const seat = state.toAct
  if (seat === null) throw new Error("Nobody is due to bid.")
  const legal = legalBids(state)
  const floor = bidFloor(state.playerCount)
  let action: Action
  if (state.highBid === null) {
    action = { type: "bid", seat, amount: legal.amounts[0] ?? floor }
  } else if (!raised && legal.amounts.includes((state.highBid ?? 0) + 50)) {
    action = { type: "bid", seat, amount: (state.highBid ?? 0) + 50 }
    raised = true
  } else if (legal.pass) {
    action = { type: "pass", seat }
  } else {
    action = { type: "bid", seat, amount: legal.amounts[0] ?? floor }
  }
  const played = step(state, action)
  state = played.state
  if (action.type === "pass") console.log(`Seat ${seat} passes.`)
  else if (action.amount === floor && state.bids.length === 1) console.log(`Seat ${seat} opens at ${count(action.amount)}.`)
  else console.log(`Seat ${seat} raises to ${count(action.amount)}.`)
  const won = played.events.find((event) => event.type === "auctionWon")
  if (won && won.type === "auctionWon") console.log(`Seat ${won.bidder} wins the auction at ${count(won.amount)}.`)
  if (played.events.some((event) => event.type === "redeal")) {
    throw new Error(`Seed ${SEED.join(", ")} redeals. Pick another fixed seed.`)
  }
}

const calls = legalCalls(state)
const called = calls[0]
if (!called || state.bidder === null) throw new Error("The bidder has no callable card.")
{
  const played = step(state, { type: "call", seat: state.bidder, card: called })
  state = played.state
  console.log("")
  console.log("Call")
  console.log(`Seat ${state.bidder} calls the ${cardText(called)}. ${SUIT_NAME[called.suit]![0]!.toUpperCase()}${SUIT_NAME[called.suit]!.slice(1)} are trump.`)
  console.log("The partners stay hidden.")
}

console.log("")
console.log("Play")
let trickLines: string[] = []
let trickNumber = 1
while (state.phase === "play") {
  const seat = state.toAct
  if (seat === null) throw new Error("Nobody is due to play.")
  const card = legalPlays(state)[0]
  if (!card) throw new Error("No legal card.")
  const lead = state.currentTrick.length === 0
  const played = step(state, { type: "play", seat, card })
  state = played.state
  trickLines.push(`Seat ${seat} ${lead ? "leads" : "plays"} the ${cardText(card)}.`)
  for (const event of played.events) {
    if (event.type === "partnerRevealed") {
      trickLines.push(`Seat ${event.seat} is revealed as a partner.`)
    }
    if (event.type === "trickWon") {
      console.log(`Trick ${trickNumber}`)
      for (const line of trickLines) console.log(`  ${line}`)
      console.log(`  Seat ${event.winner} wins the trick.`)
      console.log("")
      trickLines = []
      trickNumber += 1
    }
  }
}

if (!state.result) throw new Error("The round did not score.")
const result = state.result
console.log("Result")
console.log(
  `The team captured ${count(result.teamPoints)} points. The bid was ${count(result.bid)}, so the bid is ${result.made ? "made" : "bust"}.`,
)
console.log(`Partners: ${result.partners.map((seat) => `Seat ${seat}`).join(" and ")}.`)
console.log("Score changes:")
result.scoreChanges.forEach((change, seat) => {
  console.log(`  Seat ${seat}: ${signed(change)}`)
})
