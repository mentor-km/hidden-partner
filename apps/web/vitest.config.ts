import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const repoRoot = fileURLToPath(new URL("../..", import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: [repoRoot] } },
  test: {
    name: "web",
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
  },
})
