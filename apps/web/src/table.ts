import { RANKS, bidFloor } from "@hidden-partner/rules"

export function cardRange(playerCount: number): string {
  const ranks = RANKS.slice(0, playerCount)
  const high = ranks[0]
  const low = ranks[ranks.length - 1]
  if (!high || !low) return ""
  return `${low} to ${high}`
}

export function tableSizeLine(playerCount: number): string {
  if (playerCount < 5) {
    const more = 5 - playerCount
    const noun = more === 1 ? "player" : "players"
    return `${playerCount} players. Need ${more} more ${noun}`
  }
  return `${playerCount} players. Cards ${cardRange(playerCount)}. Opening bid ${bidFloor(playerCount).toLocaleString("en-US")}`
}
