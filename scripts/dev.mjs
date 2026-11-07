import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const children = []

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
    return response.status > 0
  } catch {
    return false
  }
}

if (
  (await reachable("http://127.0.0.1:8787/api/rooms")) ||
  (await reachable("http://127.0.0.1:5173/"))
) {
  console.error("A dev server is already running on port 8787 or 5173. Stop it before starting another.")
  process.exit(1)
}

function start(args) {
  const child = spawn("pnpm", args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  })
  children.push(child)
  child.on("exit", (code, signal) => {
    if (signal) return
    if (code && code !== 0) shutdown(code)
  })
  return child
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.pid) continue
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true })
    } else {
      child.kill("SIGTERM")
    }
  }
  setTimeout(() => process.exit(code), 400)
}

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))

start(["--filter", "@hidden-partner/server", "dev"])

const deadline = Date.now() + 90_000
let up = false
while (Date.now() < deadline) {
  try {
    const response = await fetch("http://127.0.0.1:8787/api/rooms")
    if (response.status > 0) {
      up = true
      break
    }
  } catch {
    // The room server is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 400))
}
if (!up) {
  console.error("The room server did not start.")
  shutdown(1)
} else {
  start(["--filter", "@hidden-partner/web", "dev"])
}
