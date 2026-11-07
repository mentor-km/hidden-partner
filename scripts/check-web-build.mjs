import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { assetUrl, readPublicSiteUrl } from "./public-site.mjs"

const dist = fileURLToPath(new URL("../apps/web/dist", import.meta.url))
const toml = await readFile(fileURLToPath(new URL("../apps/server/wrangler.toml", import.meta.url)), "utf8")
const site = readPublicSiteUrl(toml)
const forbidden = "Seed must be four integers."
const files = await walk(dist)

const maps = files.filter((file) => file.endsWith(".map") || file.endsWith(".ts") || file.endsWith(".tsx"))
if (maps.length > 0) throw new Error(`The web build contains source files: ${maps.join(", ")}`)
if (!files.some((file) => file.endsWith(`${join("dist", "_headers")}`) || file.endsWith("_headers"))) {
  throw new Error("The web build is missing _headers")
}

const htmlPath = files.find((file) => file.endsWith("index.html"))
if (!htmlPath) throw new Error("The web build is missing index.html")
const html = await readFile(htmlPath, "utf8")
const image = assetUrl(site, "/og.png")
if (!html.includes(`content="${image}"`)) {
  throw new Error(`index.html does not use the public image URL ${image}`)
}
if (html.includes("/src/main.tsx")) throw new Error("index.html still points at the dev script")

for (const file of files.filter((item) => item.endsWith(".js"))) {
  const source = await readFile(file, "utf8")
  if (source.includes(forbidden)) throw new Error("The web build contains the deal")
}

if (!site) {
  console.warn(
    "PUBLIC_SITE_URL is empty. Share links use the address in the browser, and the preview image stays relative. Set it in apps/server/wrangler.toml before inviting friends. See DEPLOY.md.",
  )
}

async function walk(directory) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...(await walk(path)))
    else found.push(path)
  }
  return found
}
