import {
  BID_CAP,
  POOL,
  bidFloor,
  callableCards,
  cardPoints,
  cardsEqual,
  copyCard,
  namesEqual,
  rankValue,
  sortHand,
} from "./cards.ts"
import { roundResult } from "./score.ts"
import type {
  Action,
  ApplyResult,
  Card,
  CardName,
  GameEvent,
  PlayedCard,
  RoundState,
  SeatView,
  Suit,
} from "./types.ts"

export function legalBids(state: RoundState): { pass: boolean; amounts: number[] } {
  if (state.phase !== "bidding" || state.toAct === null) return { pass: false, amounts: [] }
  if (state.highBid === null) {
    const forced = state.toAct === state.dealer
    return { pass: !forced, amounts: [bidFloor(state.playerCount)] }
  }
  const amounts = [10, 50]
    .map((step) => state.highBid! + step)
    .filter((amount) => amount <= BID_CAP)
  return { pass: true, amounts }
}

export function legalCalls(state: RoundState): CardName[] {
  if (state.phase !== "call" || state.bidder === null) return []
  return callableCards(state.hands[state.bidder] ?? [])
}

export function legalPlays(state: RoundState): Card[] {
  if (state.phase !== "play" || state.toAct === null) return []
  const hand = state.hands[state.toAct] ?? []
  if (state.currentTrick.length === 0) return hand.map(copyCard)
  const led = state.currentTrick[0]!.card.suit
  const follow = hand.filter((card) => card.suit === led)
  return (follow.length > 0 ? follow : hand).map(copyCard)
}

export function viewFor(state: RoundState, seat: number): SeatView {
  const trickNumber =
    state.phase === "play" ? state.tricks.length + 1 : state.phase === "scored" ? state.tricks.length : null
  return {
    seat,
    playerCount: state.playerCount,
    dealer: state.dealer,
    phase: state.phase,
    hand: (state.hands[seat] ?? []).map(copyCard),
    passed: [...state.passed],
    bids: state.bids.map((bid) => ({ seat: bid.seat, amount: bid.amount })),
    highBid: state.highBid,
    highBidder: state.highBidder,
    toAct: state.toAct,
    bidder: state.bidder,
    bid: state.bid,
    calledCard: state.calledCard ? { suit: state.calledCard.suit, rank: state.calledCard.rank } : null,
    trump: state.trump,
    revealedPartners: [...state.revealedPartners],
    currentTrick: state.currentTrick.map(copyPlay),
    completedTricks: state.tricks.length,
    trickNumber,
    leader: state.leader,
    result:
      state.phase === "scored" && state.result
        ? {
            bidder: state.result.bidder,
            bid: state.result.bid,
            calledCard: { suit: state.result.calledCard.suit, rank: state.result.calledCard.rank },
            copiesHeld: state.result.copiesHeld,
            partners: [...state.result.partners],
            teamPoints: state.result.teamPoints,
            othersPoints: state.result.othersPoints,
            made: state.result.made,
            scoreChanges: [...state.result.scoreChanges],
          }
        : null,
  }
}

export function apply(state: RoundState, action: Action): ApplyResult {
  if (action.type === "pass" || action.type === "bid") return applyBid(state, action)
  if (action.type === "call") return applyCall(state, action)
  return applyPlay(state, action)
}

function applyBid(state: RoundState, action: Extract<Action, { type: "pass" | "bid" }>): ApplyResult {
  if (state.phase !== "bidding" || state.toAct === null) return fail("The round is not at that step.")
  if (action.seat !== state.toAct) return fail("It is not that player's turn.")
  const legal = legalBids(state)
  if (action.type === "pass") {
    if (!legal.pass) return fail(`The last player must open at ${formatCount(bidFloor(state.playerCount))}.`)
    const passed = state.passed.map((value, seat) => (seat === action.seat ? true : value))
    const next: RoundState = { ...state, passed }
    if (next.highBidder !== null && passed.filter((value) => !value).length === 1) {
      const finished = finishAuction(next)
      return ok(finished.state, [{ type: "pass", seat: action.seat }, ...finished.events])
    }
    return ok(
      { ...next, toAct: nextActive(passed, action.seat, state.playerCount) },
      [{ type: "pass", seat: action.seat }],
    )
  }
  if (!legal.amounts.includes(action.amount)) return fail("That bid is not legal.")
  const next: RoundState = {
    ...state,
    highBid: action.amount,
    highBidder: action.seat,
    bids: [...state.bids, { seat: action.seat, amount: action.amount }],
  }
  const bidEvent: GameEvent = { type: "bid", seat: action.seat, amount: action.amount }
  const everyoneElsePassed = state.passed.every((value, seat) => seat === action.seat || value)
  if (action.amount === BID_CAP || everyoneElsePassed) {
    const finished = finishAuction(next)
    return ok(finished.state, [bidEvent, ...finished.events])
  }
  return ok({ ...next, toAct: nextActive(state.passed, action.seat, state.playerCount) }, [bidEvent])
}

function applyCall(state: RoundState, action: Extract<Action, { type: "call" }>): ApplyResult {
  if (state.phase !== "call" || state.bidder === null || state.toAct !== state.bidder) {
    return fail("The round is not at that step.")
  }
  if (action.seat !== state.bidder) return fail("It is not that player's turn.")
  const hand = state.hands[action.seat] ?? []
  if (!callableCards(hand).some((card) => namesEqual(card, action.card))) {
    return fail("That card cannot be called.")
  }
  const copiesHeld = hand.filter((card) => namesEqual(card, action.card)).length
  if (copiesHeld !== 1 && copiesHeld !== 2) return fail("That card cannot be called.")
  const partners: number[] = []
  state.hands.forEach((cards, seat) => {
    if (seat !== action.seat && cards.some((card) => namesEqual(card, action.card))) partners.push(seat)
  })
  const calledCard: CardName = { suit: action.card.suit, rank: action.card.rank }
  return ok(
    {
      ...state,
      phase: "play",
      calledCard,
      trump: calledCard.suit,
      partners,
      copiesHeld,
      revealedPartners: [],
      leader: action.seat,
      toAct: action.seat,
      currentTrick: [],
    },
    [{ type: "called", seat: action.seat, card: calledCard, trump: calledCard.suit }],
  )
}

function applyPlay(state: RoundState, action: Extract<Action, { type: "play" }>): ApplyResult {
  if (state.phase !== "play" || state.toAct === null || state.trump === null || state.bidder === null) {
    return fail("The round is not at that step.")
  }
  if (action.seat !== state.toAct) return fail("It is not that player's turn.")
  const hand = state.hands[action.seat] ?? []
  if (!hand.some((card) => cardsEqual(card, action.card))) return fail("That card cannot be played.")
  if (!legalPlays(state).some((card) => cardsEqual(card, action.card))) return fail("That card cannot be played.")

  const trickNumber = state.tricks.length + 1
  const events: GameEvent[] = [{ type: "played", seat: action.seat, card: copyCard(action.card) }]
  let revealedPartners = state.revealedPartners
  if (
    state.calledCard &&
    action.seat !== state.bidder &&
    namesEqual(action.card, state.calledCard) &&
    !revealedPartners.includes(action.seat)
  ) {
    revealedPartners = [...revealedPartners, action.seat]
    events.push({ type: "partnerRevealed", seat: action.seat, trickNumber })
  }

  const hands = state.hands.map((cards, seat) => (seat === action.seat ? withoutCard(cards, action.card) : cards))
  const currentTrick = [...state.currentTrick, { seat: action.seat, card: copyCard(action.card) }]
  if (currentTrick.length < state.playerCount) {
    return ok(
      {
        ...state,
        hands,
        revealedPartners,
        currentTrick,
        toAct: (action.seat + 1) % state.playerCount,
      },
      events,
    )
  }

  const winner = trickWinner(currentTrick, state.trump)
  const points = currentTrick.reduce((sum, play) => sum + cardPoints(play.card.rank), 0)
  const tricks = [...state.tricks, { cards: currentTrick.map(copyPlay), winner, points }]
  events.push({ type: "trickWon", winner, trickNumber })
  if (tricks.length < 12) {
    return ok(
      {
        ...state,
        hands,
        revealedPartners,
        currentTrick: [],
        tricks,
        leader: winner,
        toAct: winner,
      },
      events,
    )
  }

  const settled = settle({ ...state, hands, revealedPartners, currentTrick: [], tricks })
  events.push({ type: "roundSettled", result: settled.result! })
  return ok(settled, events)
}

function settle(state: RoundState): RoundState {
  const bidder = state.bidder
  const partners = state.partners
  const bid = state.bid
  const calledCard = state.calledCard
  const copiesHeld = state.copiesHeld
  if (bidder === null || partners === null || bid === null || calledCard === null || copiesHeld === null) {
    throw new Error("Cannot score a round before the call.")
  }
  let teamPoints = 0
  for (const trick of state.tricks) {
    if (trick.winner === bidder || partners.includes(trick.winner)) teamPoints += trick.points
  }
  const result = roundResult({
    playerCount: state.playerCount,
    bidder,
    partners,
    bid,
    copiesHeld,
    teamPoints,
    othersPoints: POOL - teamPoints,
    calledCard,
  })
  return {
    ...state,
    phase: "scored",
    toAct: null,
    leader: null,
    currentTrick: [],
    result,
  }
}

function finishAuction(state: RoundState): { state: RoundState; events: GameEvent[] } {
  const bidder = state.highBidder
  const bid = state.highBid
  if (bidder === null || bid === null) throw new Error("The auction ended with no bid.")
  const events: GameEvent[] = [{ type: "auctionWon", bidder, amount: bid }]
  if (callableCards(state.hands[bidder] ?? []).length === 0) {
    return {
      state: {
        ...state,
        phase: "redeal",
        bidder,
        bid,
        toAct: null,
        partners: null,
        copiesHeld: null,
      },
      events: [...events, { type: "redeal" }],
    }
  }
  return {
    state: { ...state, phase: "call", bidder, bid, toAct: bidder },
    events,
  }
}

function trickWinner(trick: readonly PlayedCard[], trump: Suit): number {
  const led = trick[0]!.card.suit
  const winningSuit = trick.some((play) => play.card.suit === trump) ? trump : led
  let best = -1
  let winner = trick[0]!.seat
  for (const play of trick) {
    if (play.card.suit !== winningSuit) continue
    const value = rankValue(play.card.rank)
    if (value >= best) {
      best = value
      winner = play.seat
    }
  }
  return winner
}

function withoutCard(hand: readonly Card[], card: Card): Card[] {
  const index = hand.findIndex((candidate) => cardsEqual(candidate, card))
  return sortHand([...hand.slice(0, index), ...hand.slice(index + 1)])
}

function nextActive(passed: readonly boolean[], from: number, playerCount: number): number {
  for (let step = 1; step <= playerCount; step += 1) {
    const seat = (from + step) % playerCount
    if (!passed[seat]) return seat
  }
  throw new Error("No seat is left in the auction.")
}

function copyPlay(play: PlayedCard): PlayedCard {
  return { seat: play.seat, card: copyCard(play.card) }
}

function ok(state: RoundState, events: GameEvent[]): ApplyResult {
  return { ok: true, state, events }
}

function fail(error: string): ApplyResult {
  return { ok: false, error }
}

function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}
