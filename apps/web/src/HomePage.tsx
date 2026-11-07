import { useState } from "react"
import { useNavigate } from "react-router"
import { CreateForm } from "./CreateForm.tsx"
import { JoinForm } from "./JoinForm.tsx"
import { loadLastName, rememberName, stageJoin } from "./identity.ts"
import { Button, Screen } from "./ui.tsx"

export function HomePage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<"home" | "create" | "join">("home")
  if (mode === "create") return <CreateForm onBack={() => setMode("home")} />
  if (mode === "join") {
    return (
      <JoinForm
        initialCode=""
        initialName={loadLastName()}
        initialPin=""
        error={null}
        onBack={() => setMode("home")}
        onSubmit={({ code, name, pin }) => {
          rememberName(name)
          stageJoin(code, { name, pin })
          navigate(`/r/${code}`)
        }}
      />
    )
  }
  return (
    <Screen>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-5xl leading-tight">Hidden Partner</h1>
          <p className="text-xl">A trick-taking game for five to nine friends.</p>
        </header>
        <div className="flex flex-col gap-3">
          <Button type="button" onClick={() => setMode("create")}>
            Create a room
          </Button>
          <Button type="button" variant="quiet" onClick={() => setMode("join")}>
            Join with a code
          </Button>
        </div>
      </div>
    </Screen>
  )
}
