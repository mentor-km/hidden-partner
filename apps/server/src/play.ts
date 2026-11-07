import { apply } from "@hidden-partner/rules"
import type { Action, Rank, RoundState, Seed, Suit } from "@hidden-partner/rules"
import { createRound } from "@hidden-partner/rules/server"

export type GameLogEntry =
  | { kind: "deal"; roundNumber: number; dealer: number; playerCount: number; seed: Seed }
  | { kind: "action"; action: Action }

export function freshSeed(): Seed {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return [view.getUint32(0), view.getUint32(4), view.getUint32(8), view.getUint32(12)]
}

export function dealRound(input: {
  playerCount: number
  dealer: number
  seed: Seed
  roundNumber: number
}): { round: RoundState; entry: GameLogEntry } {
  const round = createRound({
    playerCount: input.playerCount,
    dealer: input.dealer,
    seed: input.seed,
  })
  return {
    round,
    entry: {
      kind: "deal",
      roundNumber: input.roundNumber,
      dealer: round.dealer,
      playerCount: round.playerCount,
      seed: round.seed,
    },
  }
}

export function replayCurrentRound(log: readonly GameLogEntry[]): RoundState {
  let start = -1
  for (let index = log.length - 1; index >= 0; index -= 1) {
    if (log[index]?.kind === "deal") {
      start = index
      break
    }
  }
  const deal = start >= 0 ? log[start] : undefined
  if (!deal || deal.kind !== "deal") throw new Error("The match has no deal to replay.")
  let state = createRound({ playerCount: deal.playerCount, dealer: deal.dealer, seed: deal.seed })
  for (const entry of log.slice(start + 1)) {
    if (entry.kind !== "action") continue
    const result = apply(state, entry.action)
    if (!result.ok) throw new Error(result.error)
    state = result.state
  }
  return state
}

export function playAction(
  round: RoundState,
  seat: number,
  card: { suit: Suit; rank: Rank; copy?: number },
): { action: Extract<Action, { type: "play" }> } | { error: string } {
  if (card.copy !== undefined) {
    return { action: { type: "play", seat, card: { suit: card.suit, rank: card.rank, copy: card.copy } } }
  }
  const matches = (round.hands[seat] ?? []).filter((held) => held.suit === card.suit && held.rank === card.rank)
  if (matches.length > 1) return { error: "That card needs a deck index." }
  const only = matches[0]
  return {
    action: {
      type: "play",
      seat,
      card: only
        ? { suit: only.suit, rank: only.rank, copy: only.copy }
        : { suit: card.suit, rank: card.rank, copy: 0 },
    },
  }
}
