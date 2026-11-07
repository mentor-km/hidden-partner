export type Suit = "C" | "D" | "H" | "S"
export type Rank = "A" | "K" | "Q" | "J" | "10" | "9" | "8" | "7" | "6"

export type Card = {
  suit: Suit
  rank: Rank
  copy: number
}

export type CardName = {
  suit: Suit
  rank: Rank
}

/** Four uint32 words. sfc32 keeps all four in its state. */
export type Seed = [number, number, number, number]

export type Phase = "bidding" | "call" | "play" | "redeal" | "scored"

export type PlayedCard = {
  seat: number
  card: Card
}

export type CompletedTrick = {
  cards: PlayedCard[]
  winner: number
  points: number
}

export type RoundResult = {
  bidder: number
  bid: number
  calledCard: CardName
  copiesHeld: 1 | 2
  partners: number[]
  teamPoints: number
  othersPoints: number
  made: boolean
  scoreChanges: number[]
}

export type RoundState = {
  playerCount: number
  dealer: number
  seed: Seed
  hands: Card[][]
  phase: Phase
  passed: boolean[]
  bids: { seat: number; amount: number }[]
  highBid: number | null
  highBidder: number | null
  toAct: number | null
  bidder: number | null
  bid: number | null
  calledCard: CardName | null
  trump: Suit | null
  partners: number[] | null
  copiesHeld: 1 | 2 | null
  revealedPartners: number[]
  currentTrick: PlayedCard[]
  tricks: CompletedTrick[]
  leader: number | null
  result: RoundResult | null
}

export type SeatView = {
  seat: number
  playerCount: number
  dealer: number
  phase: Phase
  hand: Card[]
  passed: boolean[]
  bids: { seat: number; amount: number }[]
  highBid: number | null
  highBidder: number | null
  toAct: number | null
  bidder: number | null
  bid: number | null
  calledCard: CardName | null
  trump: Suit | null
  revealedPartners: number[]
  currentTrick: PlayedCard[]
  completedTricks: number
  trickNumber: number | null
  leader: number | null
  result: RoundResult | null
}

export type Action =
  | { type: "pass"; seat: number }
  | { type: "bid"; seat: number; amount: number }
  | { type: "call"; seat: number; card: CardName }
  | { type: "play"; seat: number; card: Card }

export type GameEvent =
  | { type: "pass"; seat: number }
  | { type: "bid"; seat: number; amount: number }
  | { type: "auctionWon"; bidder: number; amount: number }
  | { type: "redeal" }
  | { type: "called"; seat: number; card: CardName; trump: Suit }
  | { type: "played"; seat: number; card: Card }
  | { type: "partnerRevealed"; seat: number; trickNumber: number }
  | { type: "trickWon"; winner: number; trickNumber: number }
  | { type: "roundSettled"; result: RoundResult }

export type ApplyResult =
  | { ok: true; state: RoundState; events: GameEvent[] }
  | { ok: false; error: string }

export type MatchRound = {
  bidder: number
  bid: number
  calledCard: CardName
  partners: number[]
  teamPoints: number
  othersPoints: number
  made: boolean
  scoreChanges: number[]
}

export type MatchState = {
  playerCount: number
  totals: number[]
  rounds: MatchRound[]
}
