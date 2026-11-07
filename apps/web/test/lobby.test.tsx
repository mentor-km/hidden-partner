import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, expect, it, vi } from "vitest"
import { RANKS, bidFloor } from "@hidden-partner/rules"
import type { RoomView } from "../../server/src/lobby.ts"
import { CreateForm } from "../src/CreateForm.tsx"
import { HomePage } from "../src/HomePage.tsx"
import { JoinForm } from "../src/JoinForm.tsx"
import { LobbyScreen } from "../src/LobbyScreen.tsx"
import { Problem } from "../src/StatusScreens.tsx"
import { loadIdentity } from "../src/identity.ts"

vi.mock("qrcode", () => ({
  default: {
    toString: () => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  },
}))

const NAMES = ["Ava", "Ben", "Cleo", "Drew", "Eden", "Finn", "Gia", "Hugo", "Ivy"]

function view(count: number, host = true): RoomView {
  return {
    type: "view",
    code: "K7NQ2A",
    status: "lobby",
    rounds: 5,
    hostSeat: 0,
    you: host ? { seat: 0, name: "Ava" } : { seat: 1, name: "Ben" },
    seats: Array.from({ length: count }, (_, seat) => ({
      seat,
      name: NAMES[seat] ?? `Player ${seat + 1}`,
      connected: seat !== count - 1,
    })),
  }
}

function lobby(count: number, host = true, reconnecting = false) {
  return (
    <LobbyScreen
      view={view(count, host)}
      reconnecting={reconnecting}
      notice={null}
      requestedName={host ? "Ava" : "Ben"}
      onRemove={vi.fn()}
      onRounds={vi.fn()}
      onStart={vi.fn()}
    />
  )
}

beforeEach(() => {
  localStorage.clear()
})

it("does not show the secret on the home screen", () => {
  const { secret } = loadIdentity()
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
  expect(secret.length).toBeGreaterThan(20)
  expect(document.body.innerHTML).not.toContain(secret)
  expect(screen.getByRole("button", { name: "Create a room" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Join with a code" })).toBeInTheDocument()
  expect(screen.getByText("A trick-taking game for five to nine friends.")).toBeInTheDocument()
})

it("normalizes the room code as it is typed", async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<JoinForm initialCode="" initialName="Ava" initialPin="" error={null} onSubmit={onSubmit} />)
  await user.type(screen.getByLabelText("Room code"), "ab-cd ef")
  expect(screen.getByLabelText("Room code")).toHaveValue("ABCDEF")
  await user.click(screen.getByRole("button", { name: "Join" }))
  expect(onSubmit).toHaveBeenCalledWith({ code: "ABCDEF", name: "Ava", pin: "" })
})

it("rejects a bad name and a short PIN before joining", async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()
  render(<JoinForm initialCode="K7NQ2A" initialName="" initialPin="" error={null} onSubmit={onSubmit} />)
  await user.click(screen.getByRole("button", { name: "Join" }))
  expect(screen.getByRole("alert")).toHaveTextContent("Name must be 1 to 20 characters")
  expect(onSubmit).not.toHaveBeenCalled()
  await user.type(screen.getByLabelText("Name"), "Ava")
  await user.type(screen.getByLabelText("PIN"), "12")
  await user.click(screen.getByRole("button", { name: "Join" }))
  expect(screen.getByRole("alert")).toHaveTextContent("PIN must be 4 digits")
  expect(onSubmit).not.toHaveBeenCalled()
})

it("rejects an empty name before creating a room", async () => {
  const user = userEvent.setup()
  const fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  render(
    <MemoryRouter>
      <CreateForm onBack={() => {}} />
    </MemoryRouter>,
  )
  await user.click(screen.getByRole("button", { name: "Create room" }))
  expect(screen.getByRole("alert")).toHaveTextContent("Name must be 1 to 20 characters")
  expect(fetchMock).not.toHaveBeenCalled()
})

it("shows how many more players are needed at 4, and the opening bid at 5 and 9", async () => {
  const { unmount } = render(lobby(4))
  expect(screen.getByTestId("table-size")).toHaveTextContent("4 players. Need 1 more player")
  expect(screen.getByTestId("table-size")).not.toHaveTextContent("Opening bid")
  expect(screen.getByRole("button", { name: "Start match" })).toBeDisabled()
  unmount()

  for (const count of [5, 9] as const) {
    const ranks = RANKS.slice(0, count)
    const low = ranks[ranks.length - 1]
    const high = ranks[0]
    const shown = render(lobby(count))
    const line = screen.getByTestId("table-size")
    expect(line).toHaveTextContent(`${count} players`)
    expect(line).toHaveTextContent(`Cards ${low} to ${high}`)
    expect(line).toHaveTextContent(`Opening bid ${bidFloor(count).toLocaleString("en-US")}`)
    expect(screen.getByRole("button", { name: "Start match" })).toBeEnabled()
    expect(screen.getByText("Offline")).toBeInTheDocument()
    shown.unmount()
  }
})

it("gives the host remove, rounds and start, and the guest a waiting line", async () => {
  const user = userEvent.setup()
  const onRemove = vi.fn()
  const onRounds = vi.fn()
  const onStart = vi.fn()
  const { unmount } = render(
    <LobbyScreen
      view={view(5)}
      reconnecting={false}
      notice={null}
      requestedName="Ava"
      onRemove={onRemove}
      onRounds={onRounds}
      onStart={onStart}
    />,
  )
  expect(screen.getByText(/Host/)).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Move / })).not.toBeInTheDocument()
  expect(screen.getByTestId("player-list").querySelector("[draggable='true']")).toBeNull()
  await user.click(screen.getByRole("button", { name: "Remove Cleo" }))
  expect(onRemove).toHaveBeenCalledWith(2)
  await user.click(screen.getByRole("button", { name: "3" }))
  expect(onRounds).toHaveBeenCalledWith(3)
  await user.click(screen.getByRole("button", { name: "Start match" }))
  expect(onStart).toHaveBeenCalled()
  expect(screen.queryByRole("button", { name: "Remove Ava" })).not.toBeInTheDocument()
  expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", expect.stringContaining("wa.me"))
  unmount()

  render(
    <LobbyScreen
      view={view(5, false)}
      reconnecting={false}
      notice={null}
      requestedName="Ben"
      onRemove={vi.fn()}
      onRounds={vi.fn()}
      onStart={vi.fn()}
    />,
  )
  expect(screen.getByText("Waiting for host to start")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Start match" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Remove / })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Move / })).not.toBeInTheDocument()
  expect(screen.getByText("5 rounds")).toBeInTheDocument()
})

it("shows a reconnect banner without dropping the players", () => {
  render(lobby(5, true, true))
  expect(screen.getByRole("status")).toHaveTextContent("Reconnecting")
  expect(screen.getByText("Ava")).toBeInTheDocument()
  expect(screen.getByText("Eden")).toBeInTheDocument()
})

it("shows an expired room with a way to create another", () => {
  render(
    <MemoryRouter>
      <Problem message="This room has expired" />
    </MemoryRouter>,
  )
  expect(screen.getByRole("alert")).toHaveTextContent("This room has expired")
  expect(screen.getByRole("link", { name: "Create a room" })).toHaveAttribute("href", "/")
})
