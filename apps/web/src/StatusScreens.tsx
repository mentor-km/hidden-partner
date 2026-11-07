import { Link } from "react-router"
import { Button, Screen } from "./ui.tsx"

export function Problem({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Screen>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6">
        <h1 className="font-display text-4xl">Hidden Partner</h1>
        <p role="alert" className="rounded-2xl bg-black/30 px-4 py-3 text-xl">
          {message}
        </p>
        <Button type="button" onClick={onRetry ?? (() => window.location.reload())}>
          Retry
        </Button>
        <Link
          to="/"
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-cream/50 px-4 text-lg font-semibold text-cream"
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
      <div role="status" className="mx-auto flex flex-1 flex-col items-center justify-center gap-4">
        <span className="spinner" aria-hidden="true" />
        <p className="text-xl">Joining the table…</p>
      </div>
    </Screen>
  )
}
