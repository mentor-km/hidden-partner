import { expect, test } from "@playwright/test"

test("five players join by link, the host reorders and removes, the player rejoins, and every seat is dealt once", async ({
  browser,
}) => {
  const hostContext = await browser.newContext()
  const host = await hostContext.newPage()
  await host.goto("/")
  await host.getByRole("button", { name: "Create a room" }).click()
  await host.getByLabel("Name").fill("Ava")
  await host.getByRole("button", { name: "Create room" }).click()
  await expect(host.getByRole("heading", { name: "Lobby" })).toBeVisible()
  const link = (await host.getByTestId("room-link").innerText()).trim()

  const names = ["Ben", "Cleo", "Drew", "Eden"]
  const guests = []
  for (const name of names) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(link)
    await page.getByLabel("Name").fill(name)
    await page.getByRole("button", { name: "Join" }).click()
    await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible()
    await expect(host.getByRole("button", { name: `Remove ${name}` })).toBeVisible()
    guests.push({ name, context, page })
  }

  const before = await host.getByTestId("player-list").innerText()
  await host.getByRole("button", { name: "Move Eden up" }).click()
  await expect(host.getByTestId("player-list")).not.toHaveText(before)

  await host.getByRole("button", { name: "Remove Eden" }).click()
  const eden = guests[3]
  if (!eden) throw new Error("Eden did not join")
  await expect(eden.page.getByRole("alert")).toHaveText("The host removed you from the room")
  await eden.page.getByRole("button", { name: "Join" }).click()
  await expect(eden.page.getByRole("heading", { name: "Lobby" })).toBeVisible()
  await expect(host.getByRole("button", { name: "Start match" })).toBeEnabled()
  await host.getByRole("button", { name: "Start match" }).click()

  const seats: number[] = []
  for (const page of [host, ...guests.map((guest) => guest.page)]) {
    await expect(page.getByRole("heading", { name: "Match started" })).toBeVisible()
    const text = await page.getByTestId("your-seat").innerText()
    const seat = Number(text.match(/\d+/)?.[0])
    seats.push(seat)
  }
  expect(seats.slice().sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5])

  await hostContext.close()
  for (const guest of guests) await guest.context.close()
})

test("a new device reclaims a seat with the name and PIN", async ({ browser }) => {
  const hostContext = await browser.newContext()
  const host = await hostContext.newPage()
  await host.goto("/")
  await host.getByRole("button", { name: "Create a room" }).click()
  await host.getByLabel("Name").fill("Ava")
  await host.getByRole("button", { name: "Create room" }).click()
  const link = (await host.getByTestId("room-link").innerText()).trim()

  const firstContext = await browser.newContext()
  const first = await firstContext.newPage()
  await first.goto(link)
  await first.getByLabel("Name").fill("Sam")
  await first.getByLabel("PIN").fill("2468")
  await first.getByRole("button", { name: "Join" }).click()
  await expect(first.getByRole("heading", { name: "Lobby" })).toBeVisible()

  const secondContext = await browser.newContext()
  const second = await secondContext.newPage()
  await second.goto(link)
  await second.getByLabel("Name").fill("Sam")
  await second.getByLabel("PIN").fill("0000")
  await second.getByRole("button", { name: "Join" }).click()
  await expect(second.getByRole("alert")).toHaveText("Wrong PIN")
  await second.getByLabel("PIN").fill("2468")
  await second.getByRole("button", { name: "Join" }).click()
  await expect(second.getByRole("heading", { name: "Lobby" })).toBeVisible()
  await expect(second.getByText("Sam", { exact: true })).toBeVisible()

  await hostContext.close()
  await firstContext.close()
  await secondContext.close()
})

test("an unknown room code shows Room not found", async ({ page }) => {
  await page.goto("/r/ZZZZZZ")
  await expect(page.getByRole("alert")).toHaveText("Room not found")
  await expect(page.getByRole("link", { name: "Create a room" })).toBeVisible()
})
