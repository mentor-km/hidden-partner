import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import type { Plugin } from "vite"
import { serverOnlyModule } from "../../scripts/client-boundary.mjs"
import { assetUrl, readPublicSiteUrl } from "../../scripts/public-site.mjs"

const repoRoot = fileURLToPath(new URL("../..", import.meta.url))
const site = readPublicSiteUrl(readFileSync(fileURLToPath(new URL("../server/wrangler.toml", import.meta.url)), "utf8"))

function publicSite(): Plugin {
  const image = assetUrl(site, "/og.png")
  return {
    name: "public-site",
    transformIndexHtml(html) {
      return html.replaceAll('content="/og.png"', `content="${image}"`)
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk" || !output.modules) continue
        for (const id of Object.keys(output.modules)) {
          const hit = serverOnlyModule(id)
          if (hit) this.error(`The web app bundle includes ${hit}, which must stay on the Worker.`)
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), publicSite()],
  build: { sourcemap: false },
  define: {
    "import.meta.env.PUBLIC_SITE_URL": JSON.stringify(site),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { allow: [repoRoot] },
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/parties": { target: "http://127.0.0.1:8787", changeOrigin: true, ws: true },
    },
  },
})
