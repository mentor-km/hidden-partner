import { useState } from "react"
import { useNavigate, useParams } from "react-router"
import { codeError, normalizeRoomCode } from "./code.ts"
import { JoinForm } from "./JoinForm.tsx"
import { loadLastName, rememberName, rememberedRoom, stageJoin, stagedJoin } from "./identity.ts"
import { LobbyScreen } from "./LobbyScreen.tsx"
import { isRoomUnavailable } from "./session.ts"
import { TableScreen } from "./play/TableScreen.tsx"
import { Joining, Problem } from "./StatusScreens.tsx"
import { useRoom } from "./useRoom.ts"
import type { JoinRequest } from "./useRoom.ts"

export function RoomPage() {
  const params = useParams()
  const navigate = useNavigate()
  const code = normalizeRoomCode(params.code ?? "")
  const invalid = codeError(params.code ?? "")
  const saved = invalid ? null : rememberedRoom(code)
  const staged = invalid ? null : stagedJoin(code)
  const [request, setRequest] = useState<JoinRequest | null>(() => {
    if (invalid) return null
    if (staged) return { name: staged.name, pin: staged.pin, attempt: 1 }
    if (saved) return { name: saved.name, pin: "", attempt: 1 }
    return null
  })
  const { session, send } = useRoom(invalid ? "" : code, invalid ? null : request)

  if (invalid) return <Problem message={invalid} />
  if (isRoomUnavailable(session.error)) return <Problem message={session.error ?? "Room not found"} />

  function submit(value: { code: string; name: string; pin: string }) {
    rememberName(value.name)
    if (value.code !== code) {
      stageJoin(value.code, { name: value.name, pin: value.pin })
      navigate(`/r/${value.code}`)
      return
    }
    stageJoin(code, { name: value.name, pin: value.pin })
    setRequest({ name: value.name, pin: value.pin, attempt: (request?.attempt ?? 0) + 1 })
  }

  if (!request || session.phase === "form") {
    return (
      <JoinForm
        key={`${code}-${request?.attempt ?? 0}`}
        initialCode={code}
        initialName={request?.name || saved?.name || loadLastName()}
        initialPin={request?.pin ?? ""}
        error={session.phase === "form" ? session.error : null}
        onSubmit={submit}
      />
    )
  }
  if (!session.view) return <Joining />
  if (session.view.status !== "lobby") {
    return (
      <TableScreen
        view={session.view}
        reconnecting={session.phase === "reconnecting"}
        notice={session.error}
        onSend={send}
        onHome={() => navigate("/")}
      />
    )
  }
  return (
    <LobbyScreen
      view={session.view}
      reconnecting={session.phase === "reconnecting"}
      notice={session.error}
      requestedName={request.name}
      onMove={(from, to) => send({ type: "move_seat", from, to })}
      onRemove={(seat) => send({ type: "remove_player", seat })}
      onRounds={(rounds) => send({ type: "set_rounds", rounds })}
      onStart={() => send({ type: "start_match" })}
    />
  )
}
