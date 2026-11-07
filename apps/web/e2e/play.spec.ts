import { expect, test } from "@playwright/test"
import type { Browser, Page } from "@playwright/test"

test.describe.configure({ timeout: 180_000 })

async function openTable(browser: Browser, rounds: 3 | 5, players = 5) {
  const hostContext = await browser.newContext()
  const host = await hostContext.newPage()
  await host.goto("/")
  await host.getByRole("button", { name: "Create a room" }).click()
  await host.getByLabel("Name").fill("Ava")
  if (rounds === 3) await host.getByRole("button", { name: "3", exact: true }).click()
  await host.getByRole("button", { name: "Create room" }).click()
  await expect(host.getByRole("heading", { name: "Lobby" })).toBeVisible()
  const link = (await host.getByTestId("room-link").innerText()).trim()
  const names = ["Ben", "Cleo", "Drew", "Eden", "Finn", "Gia", "Hugo", "Ivy"].slice(0, players - 1)
  const guests = []
  for (const name of names) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(link)
    await page.getByLabel("Name").fill(name)
    await page.getByRole("button", { name: "Join" }).click()
    await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible()
    guests.push({ context, page })
  }
  if (rounds === 3) {
    await expect(host.getByRole("button", { name: "3", exact: true })).toHaveAttribute("aria-pressed", "true")
  }
  await host.getByRole("button", { name: "Start match" }).click()
  await expect(host.getByTestId("table")).toBeVisible()
  const pages = [host, ...guests.map((guest) => guest.page)]
  return { hostContext, host, guests, pages }
}

async function markPage(page: Page): Promise<string> {
  if (await page.getByRole("heading", { name: "Round result" }).isVisible()) return "result"
  if (await page.getByRole("heading", { name: "Match over" }).isVisible()) return "over"
  const table = page.getByTestId("table")
  if ((await table.count()) === 0) return "none"
  return (await table.getAttribute("data-snapshot")) ?? "none"
}

function boardText(text: string): string {
  return text.replaceAll(" (you)", "").trim()
}

async function turnChipInView(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const strip = document.querySelector("[data-testid='seats']")
    const chip = strip?.querySelector("[data-testid='turn-chip']")
    if (!(strip instanceof HTMLElement) || !(chip instanceof HTMLElement)) return false
    const area = strip.getBoundingClientRect()
    const box = chip.getBoundingClientRect()
    return box.width > 0 && box.left >= area.left - 1 && box.right <= area.right + 1
  })
}

async function everyoneSees(pages: Page[], heading: string): Promise<boolean> {
  for (const page of pages) {
    if ((await page.getByRole("heading", { name: heading, exact: true }).count()) === 0) return false
  }
  return true
}

async function playOne(pages: Page[], stop: "round" | "final"): Promise<"round" | "final" | "played"> {
  if (await everyoneSees(pages, "Match over")) return "final"
  if (await everyoneSees(pages, "Round result")) {
    if (stop === "round") return "round"
    const next = pages[0]!.getByTestId("next-round")
    await next.click()
    await expect(pages[0]!.getByTestId("table")).toBeVisible()
    return "played"
  }
  for (const page of pages) {
    const choices = page.locator('[data-legal="true"]:not([data-testid="next-round"])')
    const count = await choices.count()
    if (count === 0) continue
    const choice = choices.nth(Math.floor(Math.random() * count))
    const before = (await Promise.all(pages.map(markPage))).join("|")
    try {
      await choice.click({ timeout: 2_000 })
    } catch {
      return "played"
    }
    const started = Date.now()
    while (Date.now() - started < 4_000) {
      const now = (await Promise.all(pages.map(markPage))).join("|")
      if (now !== before) return "played"
      await pages[0]!.waitForTimeout(40)
    }
    return "played"
  }
  await pages[0]!.waitForTimeout(150)
  return "played"
}

async function playUntil(pages: Page[], stop: "round" | "final") {
  for (let step = 0; step < 500; step += 1) {
    const outcome = await playOne(pages, stop)
    if (outcome === stop) return
    if (stop === "round" && outcome === "final") return
  }
  throw new Error(`The match did not reach ${stop}`)
}

test("five players finish one round with the same leaderboard", async ({ browser }) => {
  const table = await openTable(browser, 5)
  await table.host.setViewportSize({ width: 360, height: 740 })
  await expect(table.host.getByRole("region", { name: "Bidding" })).toBeVisible()
  await table.host.screenshot({ path: "test-results/phone-bidding.png" })
  await table.host.setViewportSize({ width: 1280, height: 720 })

  let shotTrick = false
  for (let step = 0; step < 500 && !shotTrick; step += 1) {
    if ((await table.host.getByTestId("trick-card").count()) > 0) {
      await table.host.setViewportSize({ width: 360, height: 740 })
      await table.host.screenshot({ path: "test-results/phone-trick.png" })
      await table.host.setViewportSize({ width: 1280, height: 720 })
      shotTrick = true
      break
    }
    const outcome = await playOne(table.pages, "round")
    if (outcome === "round" || outcome === "final") break
  }
  await playUntil(table.pages, "round")
  await table.host.setViewportSize({ width: 360, height: 740 })
  await table.host.screenshot({ path: "test-results/phone-result.png" })
  const boards = []
  for (const page of table.pages) {
    await expect(page.getByRole("heading", { name: "Round result" })).toBeVisible()
    boards.push(boardText(await page.getByTestId("leaderboard").innerText()))
  }
  expect(new Set(boards).size).toBe(1)
  await table.hostContext.close()
  for (const guest of table.guests) await guest.context.close()
})

test("a refresh mid-trick keeps the player's hand and the match continues", async ({ browser }) => {
  const table = await openTable(browser, 5)
  let refreshed: Page | null = null
  for (let step = 0; step < 200 && !refreshed; step += 1) {
    for (const page of table.pages) {
      const count = await page.getByTestId("trick-card").count()
      if (count > 0 && count < 5) {
        refreshed = page
        break
      }
    }
    if (!refreshed) await playOne(table.pages, "round")
  }
  if (!refreshed) throw new Error("No partial trick appeared")
  const hand = await refreshed.locator('[data-testid="hand-card"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label")).join("|"),
  )
  await refreshed.reload()
  await expect
    .poll(() =>
      refreshed.locator('[data-testid="hand-card"]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label")).join("|"),
      ),
    )
    .toBe(hand)
  await playUntil(table.pages, "round")
  await expect(refreshed.getByRole("heading", { name: "Round result" })).toBeVisible()
  await table.hostContext.close()
  for (const guest of table.guests) await guest.context.close()
})

test("a three-round match ends on the final screen", async ({ browser }) => {
  const table = await openTable(browser, 3)
  await playUntil(table.pages, "final")
  const boards = []
  for (const page of table.pages) {
    await expect(page.getByRole("heading", { name: "Match over" })).toBeVisible()
    boards.push(boardText(await page.getByTestId("leaderboard").innerText()))
  }
  expect(new Set(boards).size).toBe(1)
  await table.hostContext.close()
  for (const guest of table.guests) await guest.context.close()
})

test("nine players fit a phone-width table through one round", async ({ browser }) => {
  test.setTimeout(240_000)
  const table = await openTable(browser, 5, 9)
  let seenTurn = ""
  async function checkTurn() {
    if ((await table.host.getByTestId("table").count()) === 0) return
    const seat = await table.host.locator("[data-testid='seats'] [data-turn='true']").getAttribute("data-seat")
    if (!seat || seat === seenTurn) return
    seenTurn = seat
    const size = table.host.viewportSize()
    await table.host.setViewportSize({ width: 360, height: 740 })
    await expect.poll(() => turnChipInView(table.host)).toBe(true)
    if (size) await table.host.setViewportSize(size)
  }
  await table.host.setViewportSize({ width: 360, height: 740 })
  await expect(table.host.getByRole("region", { name: "Bidding" })).toBeVisible()
  await checkTurn()
  await table.host.screenshot({ path: "test-results/phone-9-bidding.png" })
  await table.host.setViewportSize({ width: 1280, height: 720 })

  let shotTrick = false
  for (let step = 0; step < 500; step += 1) {
    if (!shotTrick && (await table.host.getByTestId("trick-card").count()) > 0) {
      await table.host.setViewportSize({ width: 360, height: 740 })
      await expect.poll(() => turnChipInView(table.host)).toBe(true)
      await table.host.screenshot({ path: "test-results/phone-9-trick.png" })
      await table.host.getByTestId("current-trick").screenshot({ path: "test-results/phone-9-cards.png" })
      await table.host.setViewportSize({ width: 1280, height: 720 })
      shotTrick = true
    }
    if (await everyoneSees(table.pages, "Round result")) break
    const outcome = await playOne(table.pages, "round")
    if (outcome === "round" || outcome === "final") break
    await checkTurn()
  }
  expect(shotTrick).toBe(true)
  await table.host.setViewportSize({ width: 360, height: 740 })
  await expect(table.host.getByRole("heading", { name: "This round" })).toBeVisible()
  await table.host.screenshot({ path: "test-results/phone-9-result.png" })
  await table.hostContext.close()
  for (const guest of table.guests) await guest.context.close()
})
