import { describe, expect, it } from "vitest"
import { apply, legalPlays } from "../src/index.ts"
import type { Card, GameEvent } from "../src/types.ts"
import { atPlay, c, playOut, unwrap } from "./helpers.ts"

function playTrick(cards: { seat: number; card: ReturnType<typeof c> }[], trump: "S" | "H" = "S") {
  let state = atPlay(
    cards.map((play) => [play.card]),
    { trump, calledCard: { suit: trump, rank: "A" }, toAct: 0, leader: 0 },
  )
  const events: GameEvent[] = []
  for (const play of cards) {
    const result = apply(state, { type: "play", seat: play.seat, card: play.card })
    expect(result.ok).toBe(true)
    if (!result.ok) return state
    state = result.state
    events.push(...result.events)
  }
  return { state, events }
}

describe("tricks", () => {
  it("requires a player who has the led suit to follow it", () => {
    let state = atPlay([
      [c("10H0"), c("AS0")],
      [c("KH0"), c("AS1")],
      [c("QH0")],
      [c("JH0")],
      [c("9H0")],
    ])
    state = unwrap(apply(state, { type: "play", seat: 0, card: c("10H0") }))
    const before = structuredClone(state)
    expect(legalPlays(state).map((card) => card.rank + card.suit)).toEqual(["KH"])
    expect(apply(state, { type: "play", seat: 1, card: c("AS1") }).ok).toBe(false)
    expect(state).toEqual(before)
    state = unwrap(apply(state, { type: "play", seat: 1, card: c("KH0") }))
    expect(state.currentTrick).toHaveLength(2)
  })

  it("lets a player without the led suit trump or discard", () => {
    let state = atPlay([
      [c("10H0")],
      [c("AS0"), c("10D0")],
      [c("9C0")],
      [c("9D0")],
      [c("9H0")],
    ])
    state = unwrap(apply(state, { type: "play", seat: 0, card: c("10H0") }))
    const choices = legalPlays(state).map((card) => `${card.rank}${card.suit}${card.copy}`)
    expect(choices).toHaveLength(2)
    expect(choices).toContain("10D0")
    expect(choices).toContain("AS0")
    const discarded = unwrap(apply(state, { type: "play", seat: 1, card: c("10D0") }))
    expect(discarded.revealedPartners).toEqual([])
    const trumped = unwrap(apply(state, { type: "play", seat: 1, card: c("AS0") }))
    expect(trumped.revealedPartners).toEqual([1])
  })

  it("requires trump to be followed when trump was led", () => {
    let state = atPlay([[c("KS0")], [c("10S0"), c("AH0")], [c("9C0")], [c("9D0")], [c("9H0")]], {
      calledCard: { suit: "S", rank: "K" },
    })
    state = unwrap(apply(state, { type: "play", seat: 0, card: c("KS0") }))
    expect(apply(state, { type: "play", seat: 1, card: c("AH0") }).ok).toBe(false)
    expect(unwrap(apply(state, { type: "play", seat: 1, card: c("10S0") })).currentTrick).toHaveLength(2)
  })

  it("gives the trick to the highest trump", () => {
    const played = playTrick([
      { seat: 0, card: c("AH0") },
      { seat: 1, card: c("10S0") },
      { seat: 2, card: c("KH0") },
      { seat: 3, card: c("QH0") },
      { seat: 4, card: c("JH0") },
    ])
    expect(played.state.tricks[0]?.winner).toBe(1)
  })

  it("gives a trick with no trump to the highest card of the led suit", () => {
    const played = playTrick(
      [
        { seat: 0, card: c("10H0") },
        { seat: 1, card: c("AC0") },
        { seat: 2, card: c("9H0") },
        { seat: 3, card: c("8H0") },
        { seat: 4, card: c("7H0") },
      ],
      "S",
    )
    expect(played.state.tricks[0]?.winner).toBe(0)
  })

  it("lets the later identical winning card take the trick", () => {
    const played = playTrick([
      { seat: 0, card: c("AS0") },
      { seat: 1, card: c("KS0") },
      { seat: 2, card: c("AS1") },
      { seat: 3, card: c("10C0") },
      { seat: 4, card: c("10D0") },
    ])
    expect(played.state.tricks[0]?.winner).toBe(2)
  })

  it("does not announce the bidder and announces each partner once", () => {
    let state = atPlay([
      [c("10H0"), c("10H1")],
      [c("AS0"), c("AS1")],
      [c("10D0"), c("10D1")],
      [c("10C0"), c("10C1")],
      [c("9C0"), c("9C1")],
    ])
    const bidderPlay = apply(atPlay([[c("AS0")], [c("10D0")], [c("10C0")], [c("9C0")], [c("9D0")]]), {
      type: "play",
      seat: 0,
      card: c("AS0"),
    })
    expect(bidderPlay.ok && bidderPlay.events.some((event) => event.type === "partnerRevealed")).toBe(false)

    state = unwrap(apply(state, { type: "play", seat: 0, card: c("10H0") }))
    const first = apply(state, { type: "play", seat: 1, card: c("AS0") })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.events).toContainEqual({ type: "partnerRevealed", seat: 1, trickNumber: 1 })
    state = first.state
    for (const play of [
      { seat: 2, card: c("10D0") },
      { seat: 3, card: c("10C0") },
      { seat: 4, card: c("9C0") },
    ]) {
      state = unwrap(apply(state, { type: "play", seat: play.seat, card: play.card }))
    }
    expect(state.leader).toBe(1)
    const second = apply(state, { type: "play", seat: 1, card: c("AS1") })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.events.some((event) => event.type === "partnerRevealed")).toBe(false)
    expect(second.state.revealedPartners).toEqual([1])
  })

  it("lets a partner keep the called card until trick 12", () => {
    const bidder: Card[] = [
      ...[0, 1, 2].flatMap((copy) => [c(`AC${copy}`), c(`KC${copy}`), c(`QC${copy}`)]),
      c("JC0"),
      c("JC1"),
      c("AS0"),
    ]
    const partner: Card[] = [...[0, 1, 2].flatMap((copy) => [c(`AD${copy}`), c(`KD${copy}`)]), c("QD0"), c("QD1"), c("QD2"), c("JD0"), c("JD1"), c("AS1")]
    expect(bidder).toHaveLength(12)
    expect(partner).toHaveLength(12)
    const filler: Card[] = []
    for (const rank of ["9", "8", "7", "6"] as const) {
      for (const suit of ["C", "D", "H"] as const) {
        for (const copy of [0, 1, 2]) filler.push({ suit, rank, copy })
      }
    }
    const hands = [bidder, partner, filler.slice(0, 12), filler.slice(12, 24), filler.slice(24, 36)]
    const { state, events } = playOut(
      atPlay(hands, {
        bidder: 0,
        leader: 0,
        toAct: 0,
        calledCard: { suit: "S", rank: "A" },
        trump: "S",
        partners: [1],
        copiesHeld: 1,
      }),
    )
    expect(state.phase).toBe("scored")
    expect(state.tricks).toHaveLength(12)
    const reveals = events.filter((event) => event.type === "partnerRevealed")
    expect(reveals).toEqual([{ type: "partnerRevealed", seat: 1, trickNumber: 12 }])
  })

  it("still plays all 12 tricks when the called card appears on trick 1", () => {
    const bidder = [c("AS0"), c("KS0"), c("QS0"), c("JS0"), c("10S0"), c("KS1"), c("QS1"), c("JS1"), c("10S1"), c("KS2"), c("QS2"), c("JS2")]
    const partner = [c("AS1"), c("AH0"), c("KH0"), c("QH0"), c("JH0"), c("10H0"), c("AH1"), c("KH1"), c("QH1"), c("JH1"), c("10H1"), c("AH2")]
    const filler: Card[] = []
    for (const rank of ["A", "K", "Q", "J", "10", "9"] as const) {
      for (const suit of ["C", "D"] as const) {
        for (const copy of [0, 1, 2]) filler.push(c(`${rank}${suit}${copy}`))
      }
    }
    const hands = [bidder, partner, filler.slice(0, 12), filler.slice(12, 24), filler.slice(24, 36)]
    const { state, events } = playOut(atPlay(hands))
    expect(state.tricks).toHaveLength(12)
    expect(state.hands.every((hand) => hand.length === 0)).toBe(true)
    expect(events.some((event) => event.type === "partnerRevealed" && event.trickNumber === 1)).toBe(true)
  })
})
