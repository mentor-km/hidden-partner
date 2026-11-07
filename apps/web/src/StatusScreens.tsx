import { Link } from "react-router"
import { Screen } from "./ui.tsx"

export function Problem({ message }: { message: string }) {
  return (
    <Screen>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6">
        <h1 className="font-display text-4xl">Hidden Partner</h1>
        <p role="alert" className="rounded-2xl bg-black/30 px-4 py-3 text-xl">
          {message}
        </p>
        <Link
          to="/"
          className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gold px-4 text-lg font-semibold text-ink"
        >
          Create a room
        </Link>
      </div>
    </Screen>
  )
}

export function Started({ seat }: { seat: number }) {
  return (
    <Screen>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4">
        <h1 className="font-display text-5xl">Match started</h1>
        <p data-testid="your-seat" className="text-2xl">
          You are in seat {seat + 1}.
        </p>
      </div>
    </Screen>
  )
}

export function Joining() {
  return (
    <Screen>
      <p className="text-xl" role="status">
        Joining the table…
      </p>
    </Screen>
  )
}
