import { BID_CAP } from "../src/index.ts"
import { ROUNDS, makeRate, playRandomRounds } from "./random-play.ts"

const REFERENCE_PLAYERS = 7
const REFERENCE_FLOOR = 1260

function closestFloor(points: readonly number[], target: number): { floor: number; rate: number } {
  let bestFloor = 0
  let bestRate = makeRate(points, 0)
  let bestGap = Math.abs(bestRate - target)
  for (let floor = 10; floor <= BID_CAP; floor += 10) {
    const rate = makeRate(points, floor)
    const gap = Math.abs(rate - target)
    if (gap < bestGap) {
      bestGap = gap
      bestFloor = floor
      bestRate = rate
    }
  }
  return { floor: bestFloor, rate: bestRate }
}

const runs = [5, 6, 7, 8, 9].map((players) => ({
  players,
  points: playRandomRounds(players).samples.map((sample) => sample.teamPoints),
}))
const reference = runs.find((run) => run.players === REFERENCE_PLAYERS)
if (!reference) throw new Error("Missing the 7-player run.")
const target = makeRate(reference.points, REFERENCE_FLOOR)

console.log(
  `Target: ${REFERENCE_PLAYERS} players at ${REFERENCE_FLOOR} makes ${(target * 100).toFixed(1)}% over ${ROUNDS} rounds`,
)
console.log("Closest floor to that make rate, to the nearest 10. Defaults are unchanged.")
for (const run of runs) {
  const match = closestFloor(run.points, target)
  console.log(`${run.players} players  floor ${match.floor}  make ${(match.rate * 100).toFixed(1)}%`)
}
