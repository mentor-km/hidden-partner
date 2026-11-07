import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { assetUrl, normalizeSite, readPublicSiteUrl } from "../../../scripts/public-site.mjs"
import { serverOnlyModule } from "../../../scripts/client-boundary.mjs"

describe("public site address", () => {
  it("accepts an https origin and rejects anything else", () => {
    expect(normalizeSite("")).toBe("")
    expect(normalizeSite("  https://hidden-partner.example.workers.dev/  ")).toBe(
      "https://hidden-partner.example.workers.dev",
    )
    expect(() => normalizeSite("http://hidden-partner.example.workers.dev")).toThrow(/https/)
    expect(() => normalizeSite("https://hidden-partner.example.workers.dev/r/ABCDEF")).toThrow(/origin/)
    expect(() => normalizeSite("https://user:pass@hidden-partner.example.workers.dev")).toThrow(/password/)
    expect(() => normalizeSite("not a url")).toThrow(/https/)
  })

  it("builds an absolute asset URL only when the site is set", () => {
    expect(assetUrl("", "/og.png")).toBe("/og.png")
    expect(assetUrl("https://hidden-partner.example.workers.dev", "/og.png")).toBe(
      "https://hidden-partner.example.workers.dev/og.png",
    )
  })

  it("reads PUBLIC_SITE_URL from the worker config", () => {
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8")
    expect(toml).toContain('new_sqlite_classes = ["RoomServer"]')
    expect(toml).toContain("upload_source_maps = false")
    expect(toml).toContain('not_found_handling = "single-page-application"')
    expect(toml).toContain('"/api/*"')
    expect(toml).toContain('"/parties/*"')
    expect(readPublicSiteUrl(toml)).toMatch(/^$|^https:\/\/[^/]+$/)
  })
})

describe("client bundle boundary", () => {
  it("names the modules that deal and save a match", () => {
    expect(serverOnlyModule("C:/repo/packages/rules/src/deal.ts")).toBe("packages/rules/src/deal.ts")
    expect(serverOnlyModule("/repo/packages/rules/src/rng.ts")).toBe("packages/rules/src/rng.ts")
    expect(serverOnlyModule("/repo/apps/server/src/play.ts")).toBe("apps/server/src/play.ts")
    expect(serverOnlyModule("/repo/packages/rules/src/cards.ts")).toBeNull()
  })
})
