import { mkdir, writeFile, access } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const index = fileURLToPath(new URL("../apps/web/dist/index.html", import.meta.url))

try {
  await access(index)
} catch {
  await mkdir(fileURLToPath(new URL("../apps/web/dist", import.meta.url)), { recursive: true })
  await writeFile(index, "<!doctype html><html><body><div id=\"root\"></div></body></html>\n")
}
