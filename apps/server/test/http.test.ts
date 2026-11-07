import { describe, expect, it } from "vitest"
import { json } from "../src/http.ts"

describe("API responses", () => {
  it("does not cache them and sets security headers", async () => {
    const response = json({ message: "Not found" }, 404)
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("x-frame-options")).toBe("DENY")
    expect(response.headers.get("permissions-policy")).toContain("camera=()")
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
    expect(await response.json()).toEqual({ message: "Not found" })
  })
})
