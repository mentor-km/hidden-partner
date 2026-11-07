import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import type { Card, Rank, Suit } from "@hidden-partner/rules"
import { bidFloor } from "@hidden-partner/rules"
import type { RoomView } from "../../server/src/lobby.ts"
import { BiddingPanel } from "../src/play/BiddingPanel.tsx"
import { CallPanel } from "../src/play/CallPanel.tsx"
import { HandRack } from "../src/play/HandRack.tsx"
import { playBlockReason } from "../src/play/reasons.ts"
import { TableScreen } from "../src/play/TableScreen.tsx"

const NAMES = ["Ava", "Ben", "Cleo", "Drew", "Eden"]

function card(suit: Suit, rank: Rank, copy = 0): Card {
  return { suit, rank, copy }
}

function dozen(): Card[] {
  const cards: Card[] = []
  for (const suit of ["C", "D", "H", "S"] as const) {
    for (const rank of ["A", "K", "Q"] as const) cards.push(card(suit, rank))
  }
  return cards
}

function room(patch: {
  status?: RoomView["status"]
  you?: number
  phase?: "bidding" | "call" | "play" | "scored"
  legal?: NonNullable<RoomView["game"]>["legal"]
  revealed?: number[]
  bidder?: number | null
  highBid?: number | null
  highBidder?: number | null
  toAct?: number | null
  dealer?: number
  passed?: boolean[]
  connected?: boolean[]
  names?: string[]
  trick?: { seat: number; card: Card }[]
  completed?: number
  leader?: number | null
}): RoomView {
  const names = patch.names ?? NAMES
  const you = patch.you ?? 0
  const phase = patch.phase ?? "bidding"
  const seats = names.map((name, seat) => ({
    seat,
    name,
    connected: patch.connected?.[seat] ?? true,
  }))
  return {
    type: "view",
    code: "K7NQ2A",
    status: patch.status ?? "playing",
    rounds: 3,
    hostSeat: 0,
    you: { seat: you, name: names[you] ?? "Ava" },
    seats,
    game: {
      roundNumber: 1,
      legal: patch.legal === undefined ? null : patch.legal,
      leaderboard:
        phase === "scored"
          ? names.map((name, seat) => ({ seat, name, total: seat === 0 ? 3140 : -1570 }))
          : null,
      winners: patch.status === "finished" ? [0] : null,
      seat: {
        seat: you,
        playerCount: names.length,
        dealer: patch.dealer ?? 0,
        phase,
        hand: dozen(),
        passed: patch.passed ?? names.map(() => false),
        bids: patch.highBid ? [{ seat: patch.highBidder ?? 1, amount: patch.highBid }] : [],
        highBid: patch.highBid ?? null,
        highBidder: patch.highBidder ?? null,
        toAct: patch.toAct === undefined ? you : patch.toAct,
        bidder: patch.bidder === undefined ? (phase === "bidding" ? null : 1) : patch.bidder,
        bid: phase === "bidding" ? null : 1570,
        calledCard: phase === "play" || phase === "scored" ? { suit: "H", rank: "K" } : null,
        trump: phase === "play" || phase === "scored" ? "H" : null,
        revealedPartners: patch.revealed ?? [],
        currentTrick: patch.trick ?? [],
        completedTricks: patch.completed ?? 0,
        trickNumber: phase === "play" ? (patch.completed ?? 0) + 1 : null,
        leader: patch.leader ?? null,
        result:
          phase === "scored"
            ? {
                bidder: 1,
                bid: 1570,
                calledCard: { suit: "H", rank: "K" },
                copiesHeld: 1,
                partners: [2, 3],
                teamPoints: 1600,
                othersPoints: 920,
                made: true,
                scoreChanges: [-1570, 3140, 1570, 1570, -1570],
              }
            : null,
      },
    },
  }
}

beforeEach(() => localStorage.clear())

it("enables only the bids the server lists", async () => {
  const floor = bidFloor(5)
  const { rerender } = render(
    <BiddingPanel
      playerCount={5}
      highBid={null}
      highBidderName={null}
      dealer={4}
      you={0}
      toAct={0}
      legal={{ bids: { pass: true, amounts: [floor] }, calls: null, plays: null }}
      onPass={vi.fn()}
      onBid={vi.fn()}
    />,
  )
  expect(screen.getByRole("button", { name: `Open at ${floor.toLocaleString("en-US")}` })).toBeEnabled()
  expect(screen.getByRole("button", { name: "Pass" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "+10" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "+50" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Bid 2,520" })).toBeDisabled()

  const bid = vi.fn()
  rerender(
    <BiddingPanel
      playerCount={5}
      highBid={floor}
      highBidderName="Ben"
      dealer={4}
      you={2}
      toAct={2}
      legal={{ bids: { pass: true, amounts: [floor + 10, floor + 50] }, calls: null, plays: null }}
      onPass={vi.fn()}
      onBid={bid}
    />,
  )
  expect(screen.getByRole("button", { name: "+10" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "+50" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "Bid 2,520" })).toBeDisabled()
  await userEvent.click(screen.getByRole("button", { name: "+50" }))
  expect(bid).toHaveBeenCalledWith(floor + 50)

  rerender(
    <BiddingPanel
      playerCount={5}
      highBid={2470}
      highBidderName="Cleo"
      dealer={0}
      you={0}
      toAct={1}
      legal={null}
      onPass={vi.fn()}
      onBid={vi.fn()}
    />,
  )
  expect(screen.getByRole("button", { name: "+10" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Pass" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Bid 2,520" })).toBeDisabled()
  expect(screen.getByText("Not your turn")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Pass" }).className).toContain("min-h-16")

  rerender(
    <BiddingPanel
      playerCount={5}
      highBid={null}
      highBidderName={null}
      dealer={0}
      you={0}
      toAct={0}
      legal={{ bids: { pass: false, amounts: [floor] }, calls: null, plays: null }}
      onPass={vi.fn()}
      onBid={vi.fn()}
    />,
  )
  expect(screen.getByTestId("must-open")).toHaveTextContent(`You must open at ${floor.toLocaleString("en-US")}`)
  expect(screen.getByRole("button", { name: "Pass" })).toBeDisabled()
  expect(screen.getByText("A pass is final for this round.")).toBeInTheDocument()
})

it("lists exactly the legal calls", () => {
  render(
    <CallPanel
      calls={[
        { suit: "H", rank: "K" },
        { suit: "S", rank: "A" },
      ]}
      waitingFor={null}
      onCall={vi.fn()}
    />,
  )
  const calls = screen.getAllByTestId("call-card").map((button) => button.textContent)
  expect(calls).toEqual(["king of hearts", "ace of spades"])
})

it("explains why a card is disabled", async () => {
  expect(playBlockReason(card("H", "A"), [{ suit: "C", rank: "K", copy: 0 }], "C")).toBe("You must follow clubs.")
  expect(playBlockReason(card("C", "K"), [{ suit: "C", rank: "K", copy: 0 }], "C")).toBeNull()
  const play = vi.fn()
  render(
    <HandRack
      hand={[card("C", "K"), card("H", "A")]}
      legalPlays={[{ suit: "C", rank: "K", copy: 0 }]}
      lead="C"
      confirm={false}
      onPlay={play}
    />,
  )
  await userEvent.click(screen.getByRole("button", { name: /ace of hearts/ }))
  expect(screen.getByTestId("card-reason")).toHaveTextContent("You must follow clubs.")
  expect(play).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole("button", { name: "king of clubs" }))
  expect(play).toHaveBeenCalledWith(card("C", "K"))
})

it("renders all 12 cards in the hand", () => {
  render(<HandRack hand={dozen()} legalPlays={null} lead={null} confirm={false} onPlay={vi.fn()} />)
  expect(screen.getAllByTestId("hand-card")).toHaveLength(12)
  expect(screen.getByTestId("hand").className).toContain("grid-cols-6")
})

it("announces each partner once and skips the bidder", () => {
  const send = vi.fn()
  const first = room({ phase: "play", bidder: 0, revealed: [1], you: 0 })
  const { rerender } = render(
    <TableScreen view={room({ phase: "play", bidder: 0, revealed: [], you: 0 })} reconnecting={false} notice={null} onSend={send} onHome={vi.fn()} />,
  )
  expect(screen.queryByTestId("partner-banner")).toBeNull()
  rerender(<TableScreen view={first} reconnecting={false} notice={null} onSend={send} onHome={vi.fn()} />)
  expect(screen.getByTestId("partner-banner")).toHaveTextContent("Ben is a partner")
  rerender(<TableScreen view={first} reconnecting={false} notice={null} onSend={send} onHome={vi.fn()} />)
  expect(screen.getAllByTestId("partner-banner")).toHaveLength(1)
  rerender(
    <TableScreen
      view={room({ phase: "play", bidder: 0, revealed: [1, 0, 2], you: 0 })}
      reconnecting={false}
      notice={null}
      onSend={send}
      onHome={vi.fn()}
    />,
  )
  const banners = screen.getAllByTestId("partner-banner").map((banner) => banner.textContent)
  expect(banners).toEqual(["Ben is a partner", "Cleo is a partner"])
})

it("renders the round result from the sample", () => {
  render(
    <TableScreen view={room({ phase: "scored", you: 2 })} reconnecting={false} notice={null} onSend={vi.fn()} onHome={vi.fn()} />,
  )
  const result = screen.getByTestId("round-result")
  expect(result).toHaveTextContent("This round")
  expect(result).toHaveTextContent("Bid 1,570 by Ben")
  expect(result).toHaveTextContent("Bid made")
  expect(result).toHaveTextContent("Bidder Ben. Partners Cleo, Drew.")
  expect(result).not.toHaveTextContent("Team:")
  expect(result).toHaveTextContent("Team points 1,600 against the bid of 1,570")
  expect(result).toHaveTextContent("Others 920")
  expect(screen.getByRole("columnheader", { name: "Rank" })).toBeInTheDocument()
  expect(screen.getByRole("columnheader", { name: "Player" })).toBeInTheDocument()
  expect(screen.getByRole("columnheader", { name: "Total" })).toBeInTheDocument()
  expect(screen.getByRole("columnheader", { name: "Change" })).toBeInTheDocument()
  expect(screen.getByRole("row", { name: /Ava/ })).toHaveTextContent("3,140")
  expect(screen.getByRole("row", { name: /Ava/ })).toHaveTextContent("−1,570")
  expect(screen.getByRole("row", { name: /Ben/ })).toHaveTextContent("−1,570")
  expect(screen.getByRole("row", { name: /Ben/ })).toHaveTextContent("+3,140")
  expect(screen.getByRole("row", { name: /Cleo/ })).toHaveTextContent("(you)")
  expect(screen.getByText("Waiting for host")).toBeInTheDocument()
  expect(screen.queryByTestId("next-round")).not.toBeInTheDocument()
})

it("shows a paused overlay and blocks bidding", () => {
  render(
    <TableScreen
      view={room({
        status: "paused",
        phase: "bidding",
        legal: { bids: { pass: true, amounts: [bidFloor(5)] }, calls: null, plays: null },
        you: 1,
      })}
      reconnecting={false}
      notice={null}
      onSend={vi.fn()}
      onHome={vi.fn()}
    />,
  )
  expect(screen.getByRole("dialog", { name: "Match paused" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Pass" })).toBeDisabled()
})

it("lists the auction during bidding and drops Pass afterwards", () => {
  const { rerender } = render(
    <TableScreen
      view={room({
        phase: "bidding",
        highBid: 1570,
        highBidder: 0,
        passed: [false, true, false, false, false],
        toAct: 2,
        you: 0,
      })}
      reconnecting={false}
      notice={null}
      onSend={vi.fn()}
      onHome={vi.fn()}
    />,
  )
  const auction = screen.getByTestId("auction")
  expect(auction).toHaveTextContent("Ava bid 1,570")
  expect(auction).toHaveTextContent("Ben passed")
  expect(screen.queryByTestId("current-trick")).not.toBeInTheDocument()
  expect(screen.getByTestId("turn-line")).toHaveTextContent("Waiting for Cleo")
  rerender(
    <TableScreen
      view={room({ phase: "play", passed: [false, true, false, false, false], you: 0, toAct: 1 })}
      reconnecting={false}
      notice={null}
      onSend={vi.fn()}
      onHome={vi.fn()}
    />,
  )
  expect(screen.queryByText("Pass")).not.toBeInTheDocument()
  expect(screen.getByText("Bidder")).toBeInTheDocument()
  expect(screen.getByText("Bid 1,570")).toBeInTheDocument()
  expect(screen.getByText("Ben bid 1,570.")).toBeInTheDocument()
})

it("shows trick cards with the player who played them", async () => {
  const view = room({
    phase: "play",
    you: 0,
    toAct: 2,
    trick: [{ seat: 1, card: card("C", "A") }],
  })
  const { rerender } = render(<TableScreen view={view} reconnecting={false} notice={null} onSend={vi.fn()} onHome={vi.fn()} />)
  const played = screen.getByTestId("trick-card")
  expect(played).toHaveTextContent("A")
  expect(played).toHaveTextContent("Ben")
  expect(screen.getByTestId("current-trick")).toHaveTextContent("Trick 1 of 12")
  expect(screen.getByTestId("follow-suit")).toHaveTextContent("You must follow clubs")
  for (const cardButton of screen.getAllByTestId("hand-card")) {
    expect(cardButton.className).not.toContain("opacity-60")
  }
  rerender(
    <TableScreen
      view={room({ phase: "play", you: 0, toAct: 2, trick: [], leader: 1, completed: 1 })}
      reconnecting={false}
      notice={null}
      onSend={vi.fn()}
      onHome={vi.fn()}
    />,
  )
  expect(await screen.findByText("Ben won")).toBeInTheDocument()
  expect(screen.getByTestId("trick-card")).toHaveAttribute("data-winner", "true")
})

it("scrolls nine seats and labels online state in words", () => {
  const names = ["Ava", "Ben", "Cleo", "Drew", "Eden", "Finn", "Gia", "Hugo", "Ivy"]
  render(
    <TableScreen
      view={room({
        names,
        phase: "play",
        you: 0,
        toAct: 8,
        connected: [false, true, true, true, true, true, true, true, true],
      })}
      reconnecting={false}
      notice={null}
      onSend={vi.fn()}
      onHome={vi.fn()}
    />,
  )
  expect(screen.getAllByTestId("seat")).toHaveLength(9)
  expect(screen.getByTestId("seats").className).toContain("overflow-x-auto")
  const turn = screen.getAllByTestId("seat").find((seat) => seat.getAttribute("data-turn") === "true")
  expect(turn).toHaveTextContent("Ivy")
  expect(turn).toHaveTextContent("Turn")
  expect(screen.getByText("Offline").className).toContain("text-[#ff8d8d]")
  expect(screen.getAllByText("Online").length).toBeGreaterThan(0)
})

it("stores the mute choice and quotes the scoring examples", async () => {
  render(<TableScreen view={room({ phase: "bidding", you: 0 })} reconnecting={false} notice={null} onSend={vi.fn()} onHome={vi.fn()} />)
  await userEvent.click(screen.getByRole("button", { name: "Mute" }))
  expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true")
  expect(localStorage.getItem("hp.muted")).toBe("1")
  await userEvent.click(screen.getByRole("button", { name: "Rules" }))
  expect(screen.getByRole("dialog", { name: "Rules" })).toHaveTextContent("Bust, Bidder held 2 copies")
  expect(screen.getByRole("dialog", { name: "Rules" })).toHaveTextContent("Bust, Bidder held 1 copy")
  expect(screen.getByRole("dialog", { name: "Rules" })).toHaveTextContent("X = 1,300")
  expect(screen.getByRole("dialog", { name: "Rules" })).toHaveTextContent("2,520")
})

it("shows the winner instead of next round when the match is finished", () => {
  render(
    <TableScreen view={room({ phase: "scored", status: "finished", you: 0 })} reconnecting={false} notice={null} onSend={vi.fn()} onHome={vi.fn()} />,
  )
  expect(screen.getByRole("heading", { name: "Match over" })).toBeInTheDocument()
  expect(screen.getByText("Winner: Ava.")).toBeInTheDocument()
  expect(screen.getByTestId("round-result")).toHaveTextContent("Bid made")
  expect(screen.queryByTestId("next-round")).not.toBeInTheDocument()
})

it("lists every player in a sheet that can be closed", async () => {
  render(<TableScreen view={room({ phase: "play", you: 0, toAct: 2 })} reconnecting={false} notice={null} onSend={vi.fn()} onHome={vi.fn()} />)
  await userEvent.click(screen.getByRole("button", { name: "Players" }))
  const sheet = screen.getByRole("dialog", { name: "Players" })
  expect(sheet).toHaveTextContent("Ava (you)")
  expect(sheet).toHaveTextContent("Cleo")
  expect(sheet).toHaveTextContent("Turn")
  expect(sheet).toHaveTextContent("Online")
  expect(sheet).toHaveTextContent("12 cards")
  await userEvent.click(screen.getByRole("button", { name: "Close" }))
  expect(screen.queryByRole("dialog", { name: "Players" })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Players" }))
  await userEvent.keyboard("{Escape}")
  expect(screen.queryByRole("dialog", { name: "Players" })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Players" }))
  await userEvent.click(screen.getByTestId("players-backdrop"))
  expect(screen.queryByRole("dialog", { name: "Players" })).not.toBeInTheDocument()
})

it("keeps next round for the host before the last round", () => {
  render(<TableScreen view={room({ phase: "scored", you: 0 })} reconnecting={false} notice={null} onSend={vi.fn()} onHome={vi.fn()} />)
  expect(screen.getByTestId("next-round")).toBeInTheDocument()
})
