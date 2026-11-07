import { readdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const dist = fileURLToPath(new URL("../apps/server/dist", import.meta.url))
const toml = await readFile(fileURLToPath(new URL("../apps/server/wrangler.toml", import.meta.url)), "utf8")
if (!toml.includes("upload_source_maps = false")) {
  throw new Error("apps/server/wrangler.toml must set upload_source_maps = false")
}

const files = await readdir(dist)
for (const name of files.filter((file) => file.endsWith(".map"))) {
  await rm(join(dist, name))
}
const scripts = files.filter((file) => file.endsWith(".js"))
if (scripts.length === 0) throw new Error("The Worker bundle was not written")
const bundled = await Promise.all(scripts.map((name) => readFile(join(dist, name), "utf8")))
if (!bundled.some((source) => source.includes("Seed must be four integers."))) {
  throw new Error("The Worker bundle does not contain the deal")
}
