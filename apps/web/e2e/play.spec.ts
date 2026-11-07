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
  const link = new URL((await host.getByTestId("room-link").innerText()).trim()).pathname
  const names = ["Ben", "Cleo", "Drew", "Eden", "Finn", "Gia", "Hugo", "Ivy"].slice(0, players - 1)
  const guests = []
  for (const name of names) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(link)
    await page.getByLabel("Name").fill(name)
    await page.getByRole("button", { name: "Join" }).click()
    const lobby = page.getByRole("heading", { name: "Lobby" })
    try {
      await expect(lobby).toBeVisible({ timeout: 15_000 })
    } catch {
      await page.reload()
      await page.getByLabel("Name").fill(name)
      await page.getByRole("button", { name: "Join" }).click()
      await expect(lobby).toBeVisible()
    }
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

async function playersClearOfStrip(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const strip = document.querySelector("[data-testid='seats']")
    const button = document.querySelector("[data-testid='players-button']")
    if (!(strip instanceof HTMLElement) || !(button instanceof HTMLElement)) return false
    const area = strip.getBoundingClientRect()
    const box = button.getBoundingClientRect()
    const overlaps = area.left < box.right - 1 && area.right > box.left + 1 && area.top < box.bottom - 1 && area.bottom > box.top + 1
    return !overlaps
  })
}

async function adjacentPlayedInView(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const strip = document.querySelector("[data-testid='seats']")
    if (!(strip instanceof HTMLElement)) return true
    const playedSeat = strip.getAttribute("data-just-played")
    const turn = strip.querySelector("[data-turn='true']")
    if (!playedSeat || !(turn instanceof HTMLElement)) return true
    const apart = Math.abs(Number(turn.getAttribute("data-seat")) - Number(playedSeat))
    if (apart !== 1) return true
    const played = strip.querySelector(`[data-seat="${playedSeat}"]`)
    if (!(played instanceof HTMLElement)) return false
    const area = strip.getBoundingClientRect()
    return [turn, played].every((node) => {
      const box = node.getBoundingClientRect()
      return box.width > 0 && box.left >= area.left - 1 && box.right <= area.right + 1
    })
  })
}

async function auctionInView(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const list = document.querySelector("[data-testid='auction'] ol")
    const name = document.querySelector("[data-testid='your-seat']")
    if (!(list instanceof HTMLElement) || !(name instanceof HTMLElement)) return false
    const box = list.getBoundingClientRect()
    const nameBox = name.getBoundingClientRect()
    const height = window.innerHeight
    const visible = Math.min(box.bottom, height) - Math.max(box.top, 0)
    return (
      list.childElementCount >= 8 &&
      visible >= 48 &&
      nameBox.height > 0 &&
      nameBox.top >= -1 &&
      nameBox.bottom <= height + 1 &&
      name.innerText.startsWith("You:")
    )
  })
}

async function tableFits(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const cards = document.querySelector("[data-testid='hand']")
    if (!(cards instanceof HTMLElement)) return false
    const box = cards.getBoundingClientRect()
    const height = window.innerHeight
    const width = window.innerWidth
    const inside = box.height > 0 && box.top >= -1 && box.bottom <= height + 1 && box.left >= -1 && box.right <= width + 1
    return inside && Math.abs(document.documentElement.scrollHeight - height) <= 1
  })
}

async function turnChipInView(page: Page): Promise<string> {
  return page.evaluate(() => {
    const strip = document.querySelector("[data-testid='seats']")
    const chip = strip?.querySelector("[data-testid='turn-chip']")
    if (!(strip instanceof HTMLElement) || !(chip instanceof HTMLElement)) return "missing"
    const area = strip.getBoundingClientRect()
    const box = chip.getBoundingClientRect()
    const inside = box.width > 0 && box.left >= area.left - 1 && box.right <= area.right + 1
    if (inside) return "ok"
    return `chip ${Math.round(box.left)}-${Math.round(box.right)} strip ${Math.round(area.left)}-${Math.round(area.right)} scroll ${Math.round(strip.scrollLeft)}/${strip.clientWidth}`
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
    const pass = page.locator("[data-testid='bid-pass'][data-legal='true']")
    const choices = page.locator('[data-legal="true"]:not([data-testid="next-round"])')
    const count = await choices.count()
    if (count === 0) continue
    const choice = (await pass.count()) > 0 ? pass.first() : choices.nth(Math.floor(Math.random() * count))
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
    await expect.poll(() => turnChipInView(table.host)).toBe("ok")
    await expect.poll(() => adjacentPlayedInView(table.host)).toBe(true)
    await expect.poll(() => playersClearOfStrip(table.host)).toBe(true)
    if (size) await table.host.setViewportSize(size)
  }
  for (let step = 0; step < 40 && (await table.host.locator("[data-testid='auction'] li").count()) < 8; step += 1) {
    if ((await table.host.getByTestId("table").getAttribute("data-phase")) !== "bidding") break
    await playOne(table.pages, "round")
  }
  await expect(table.host.locator("[data-testid='auction'] li")).not.toHaveCount(0)
  for (const height of [640, 740]) {
    await table.host.setViewportSize({ width: 360, height })
    await expect.poll(() => tableFits(table.host)).toBe(true)
    await expect.poll(() => playersClearOfStrip(table.host)).toBe(true)
  }
  await table.host.setViewportSize({ width: 360, height: 640 })
  await checkTurn()
  await expect.poll(() => auctionInView(table.host)).toBe(true)
  await table.host.locator("[data-testid='auction']").evaluate((node) => {
    const scroller = node.parentElement
    if (scroller instanceof HTMLElement) scroller.scrollTop = 0
  })
  await table.host.screenshot({ path: "test-results/phone-9-bidding.png" })
  await table.host.setViewportSize({ width: 1280, height: 720 })

  let shotTrick = false
  let shotTurn: Page | null = null
  let shotPartner = false
  for (let step = 0; step < 500; step += 1) {
    if (!shotTrick && (await table.host.getByTestId("trick-card").count()) > 0) {
      await table.host.setViewportSize({ width: 360, height: 740 })
      await expect.poll(() => turnChipInView(table.host)).toBe("ok")
      await expect.poll(() => adjacentPlayedInView(table.host)).toBe(true)
      await expect.poll(() => playersClearOfStrip(table.host)).toBe(true)
      await table.host.screenshot({ path: "test-results/phone-9-trick.png" })
      await table.host.getByTestId("current-trick").screenshot({ path: "test-results/phone-9-cards.png" })
      for (const height of [640, 740]) {
        await table.host.setViewportSize({ width: 360, height })
        await expect.poll(() => tableFits(table.host)).toBe(true)
      }
      await table.host.setViewportSize({ width: 1280, height: 720 })
      shotTrick = true
    }
    if (!shotTurn && (await table.host.getByTestId("table").getAttribute("data-phase")) === "play") {
      for (const page of table.pages) {
        const bright = await page.locator("[data-highlight='true']").count()
        const dim = await page.locator("[data-dimmed='true']").count()
        if (bright > 0 && dim > 0) {
          shotTurn = page
          await page.setViewportSize({ width: 360, height: 640 })
          await expect.poll(() => tableFits(page)).toBe(true)
          await page.screenshot({ path: "test-results/phone-9-play-640.png" })
          await page.setViewportSize({ width: 1280, height: 720 })
          break
        }
      }
    }
    if (await everyoneSees(table.pages, "Round result")) break
    const outcome = await playOne(table.pages, "round")
    if (!shotPartner) {
      await table.host.waitForTimeout(80)
      const banner = table.host.getByTestId("partner-banner").first()
      if ((await banner.count()) > 0) {
        await table.host.setViewportSize({ width: 360, height: 640 })
        await table.host.screenshot({ path: "test-results/phone-9-partner-640.png" })
        await table.host.setViewportSize({ width: 1280, height: 720 })
        shotPartner = true
      }
    }
    if (outcome === "round" || outcome === "final") break
    await checkTurn()
  }
  expect(shotTrick).toBe(true)
  expect(shotTurn).not.toBeNull()
  expect(shotPartner).toBe(true)
  await table.host.setViewportSize({ width: 360, height: 740 })
  await expect(table.host.getByRole("heading", { name: "This round" })).toBeVisible()
  await table.host.screenshot({ path: "test-results/phone-9-result.png" })
  await table.hostContext.close()
  for (const guest of table.guests) await guest.context.close()
})
