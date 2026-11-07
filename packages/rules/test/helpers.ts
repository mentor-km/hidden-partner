import { sortHand } from "../src/cards.ts"
import { apply, bidFloor, legalBids, legalCalls, legalPlays } from "../src/index.ts"
import { buildDeck, createRound } from "../src/server.ts"
import type { Card, CardName, GameEvent, Rank, RoundState, Seed, Suit } from "../src/types.ts"

const SUIT_SET = new Set(["C", "D", "H", "S"])
const RANK_SET = new Set(["A", "K", "Q", "J", "10", "9", "8", "7", "6"])

export function c(text: string): Card {
  const copy = Number(text[text.length - 1])
  const suit = text[text.length - 2] as Suit
  const rank = text.slice(0, -2) as Rank
  if (!SUIT_SET.has(suit) || !RANK_SET.has(rank) || !Number.isInteger(copy)) {
    throw new Error(`Bad card ${text}`)
  }
  return { suit, rank, copy }
}

export function unwrap(result: ReturnType<typeof apply>): RoundState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}${card.copy}`
}

export function completeHands(playerCount: number, preset: Card[][]): Card[][] {
  const used = new Set(preset.flat().map(cardKey))
  const rest = buildDeck(playerCount).filter((card) => !used.has(cardKey(card)))
  const hands = preset.map((hand) => hand.map((card) => ({ ...card })))
  let index = 0
  for (const hand of hands) {
    while (hand.length < 12) {
      const card = rest[index]
      if (!card) throw new Error("Not enough cards to fill the table.")
      hand.push(card)
      index += 1
    }
  }
  if (index !== rest.length) throw new Error("The preset does not partition the deck.")
  return hands.map(sortHand)
}

export function electAtFloor(state: RoundState, bidder: number): RoundState {
  let guard = 0
  while (state.phase === "bidding") {
    if (++guard > 40) throw new Error("The auction did not finish.")
    const seat = state.toAct
    if (seat === null) throw new Error("Nobody is due to bid.")
    const legal = legalBids(state)
    if (seat === bidder) {
      const amount = legal.amounts[0]
      if (amount === undefined) throw new Error("The bidder has no legal bid.")
      state = unwrap(apply(state, { type: "bid", seat, amount }))
    } else if (legal.pass) {
      state = unwrap(apply(state, { type: "pass", seat }))
    } else {
      const amount = legal.amounts[0]
      if (amount === undefined) throw new Error("A forced player has no bid.")
      state = unwrap(apply(state, { type: "bid", seat, amount }))
    }
  }
  const floor = bidFloor(state.playerCount)
  if (state.bidder !== bidder || state.bid !== floor) {
    throw new Error(`Expected ${bidder} to win at ${floor}.`)
  }
  return state
}

export function playOut(state: RoundState): { state: RoundState; events: GameEvent[] } {
  const events: GameEvent[] = []
  let guard = 0
  while (state.phase === "play") {
    if (++guard > 300) throw new Error("Play did not finish.")
    const seat = state.toAct
    if (seat === null) throw new Error("Nobody is due to play.")
    const card = legalPlays(state)[0]
    if (!card) throw new Error("No legal card.")
    const result = apply(state, { type: "play", seat, card })
    if (!result.ok) throw new Error(result.error)
    state = result.state
    events.push(...result.events)
  }
  return { state, events }
}

export function playHands(hands: Card[][], call: CardName, bidder = 0): { state: RoundState; events: GameEvent[] } {
  const playerCount = hands.length
  let state = createRound({
    playerCount,
    dealer: bidder,
    seed: [8, 8, 8, 8],
  })
  state = {
    ...state,
    hands: hands.map(sortHand),
    dealer: bidder,
    toAct: (bidder + 1) % playerCount,
    passed: Array.from({ length: playerCount }, () => false),
    bids: [],
    highBid: null,
    highBidder: null,
    phase: "bidding",
    bidder: null,
    bid: null,
    calledCard: null,
    trump: null,
    partners: null,
    copiesHeld: null,
    revealedPartners: [],
    currentTrick: [],
    tricks: [],
    leader: null,
    result: null,
  }
  state = electAtFloor(state, bidder)
  if (state.phase !== "call") throw new Error(`Expected the call, got ${state.phase}.`)
  state = unwrap(apply(state, { type: "call", seat: bidder, card: call }))
  return playOut(state)
}

export function atPlay(hands: Card[][], overrides: Partial<RoundState> = {}): RoundState {
  const playerCount = hands.length
  return {
    playerCount,
    dealer: 0,
    seed: [1, 2, 3, 4],
    hands,
    phase: "play",
    passed: Array.from({ length: playerCount }, () => false),
    bids: [{ seat: 0, amount: 1260 }],
    highBid: 1260,
    highBidder: 0,
    toAct: 0,
    bidder: 0,
    bid: 1260,
    calledCard: { suit: "S", rank: "A" },
    trump: "S",
    partners: [1],
    copiesHeld: 1,
    revealedPartners: [],
    currentTrick: [],
    tricks: [],
    leader: 0,
    result: null,
    ...overrides,
  }
}

export function freshBidding(playerCount: number, dealer: number, seed: Seed = [1, 2, 3, 4]): RoundState {
  return createRound({ playerCount, dealer, seed })
}

export function callFirst(state: RoundState, card?: CardName): RoundState {
  const choices = legalCalls(state)
  const chosen = card ?? choices[0]
  if (!chosen || state.bidder === null) throw new Error("Nothing can be called.")
  return unwrap(apply(state, { type: "call", seat: state.bidder, card: chosen }))
}
