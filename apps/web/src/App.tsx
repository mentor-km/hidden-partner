import { BrowserRouter, Route, Routes, useParams } from "react-router"
import { HomePage } from "./HomePage.tsx"
import { loadIdentity } from "./identity.ts"
import { RoomPage } from "./RoomPage.tsx"

loadIdentity()

function RoomRoute() {
  const { code } = useParams()
  return <RoomPage key={code} />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/r/:code" element={<RoomRoute />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  )
}
