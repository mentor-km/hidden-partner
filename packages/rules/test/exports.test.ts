import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import * as browser from "../src/index.ts"
import * as server from "../src/server.ts"

const BROWSER_EXPORTS = [
  "BID_CAP",
  "BID_FLOORS",
  "HAND_SIZE",
  "bidFloor",
  "POOL",
  "RANKS",
  "SUITS",
  "TRICKS",
  "apply",
  "bidMade",
  "buildDeck",
  "callableCards",
  "cardPoints",
  "createMatch",
  "legalBids",
  "legalCalls",
  "legalPlays",
  "nextDealer",
  "recordRound",
  "scoreChanges",
  "sortHand",
  "viewFor",
  "winners",
]

function reachable(entry: string): string[] {
  const seen = new Set<string>()
  const stack = [entry]
  while (stack.length > 0) {
    const file = stack.pop()
    if (!file || seen.has(file)) continue
    seen.add(file)
    const text = readFileSync(file, "utf8")
    for (const match of text.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      let next = match[1] ?? ""
      if (!next.endsWith(".ts")) next += ".ts"
      stack.push(resolve(dirname(file), next))
    }
  }
  return [...seen]
}

describe("browser entry", () => {
  it("does not export shuffle, deal or the seeded round builder", () => {
    expect(Object.keys(browser).sort()).toEqual([...BROWSER_EXPORTS].sort())
    for (const name of ["shuffle", "deal", "createRound", "sfc32", "uniformBelow"]) {
      expect(name in browser).toBe(false)
      expect(typeof server[name as keyof typeof server]).toBe("function")
    }
  })

  it("does not import the shuffle or the deal", () => {
    const entry = resolve(dirname(fileURLToPath(import.meta.url)), "../src/index.ts")
    const files = reachable(entry).map((file) => file.replaceAll("\\", "/"))
    expect(files.some((file) => file.endsWith("/rng.ts") || file.endsWith("/deal.ts") || file.endsWith("/server.ts"))).toBe(
      false,
    )
  })
})
