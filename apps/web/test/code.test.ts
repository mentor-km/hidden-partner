import { describe, expect, it } from "vitest"
import { codeError, inviteUrl, normalizeRoomCode, shareOrigin, whatsAppHref } from "../src/code.ts"
import { nameError, pinError, roundsError } from "../src/validate.ts"

describe("room codes", () => {
  it("uppercases a code and ignores spaces and dashes", () => {
    expect(normalizeRoomCode(" ab-cd ef ")).toBe("ABCDEF")
    expect(normalizeRoomCode("k7 nq-2a")).toBe("K7NQ2A")
  })

  it("reads a code pasted from a room link", () => {
    expect(normalizeRoomCode("http://127.0.0.1:5173/r/k7nq2a")).toBe("K7NQ2A")
  })

  it("rejects a short code and a look-alike character", () => {
    expect(codeError("ABC")).toBe("Enter the 6-character room code")
    expect(codeError("OOOOOO")).toBe("That code does not look right")
    expect(codeError("K7NQ2A")).toBeNull()
  })

  it("uses the configured public site for share links", () => {
    expect(shareOrigin("", "http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173")
    expect(shareOrigin(undefined, "http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173")
    expect(shareOrigin("https://hidden-partner.example.workers.dev/", "http://127.0.0.1:5173")).toBe(
      "https://hidden-partner.example.workers.dev",
    )
    expect(inviteUrl("https://hidden-partner.example.workers.dev", "K7NQ2A")).toBe(
      "https://hidden-partner.example.workers.dev/r/K7NQ2A",
    )
  })

  it("puts the invite line in the WhatsApp link", () => {
    const href = whatsAppHref("http://127.0.0.1:5173/r/K7NQ2A")
    expect(href.startsWith("https://wa.me/?text=")).toBe(true)
    expect(decodeURIComponent(href)).toContain("You're invited to a Hidden Partner table")
    expect(decodeURIComponent(href)).toContain("/r/K7NQ2A")
  })
})

describe("name, PIN and rounds", () => {
  it("trims a name and rejects an empty one, a long one, and a control character", () => {
    expect(nameError("  Ava  ")).toBeNull()
    expect(nameError("   ")).toBe("Name must be 1 to 20 characters")
    expect(nameError("A".repeat(21))).toBe("Name must be 1 to 20 characters")
    expect(nameError("A\u0001")).toBe("Name cannot contain control characters")
  })

  it("allows a blank PIN and requires four digits otherwise", () => {
    expect(pinError("")).toBeNull()
    expect(pinError("2468")).toBeNull()
    expect(pinError("123")).toBe("PIN must be 4 digits")
    expect(pinError("12a4")).toBe("PIN must be 4 digits")
  })

  it("accepts rounds from 1 to 99", () => {
    expect(roundsError(1)).toBeNull()
    expect(roundsError(5)).toBeNull()
    expect(roundsError(99)).toBeNull()
    expect(roundsError(0)).toBe("Rounds must be a whole number from 1 to 99")
    expect(roundsError(1.5)).toBe("Rounds must be a whole number from 1 to 99")
    expect(roundsError(100)).toBe("Rounds must be a whole number from 1 to 99")
  })
})
