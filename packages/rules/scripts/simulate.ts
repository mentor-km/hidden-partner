import { bidFloor } from "../src/index.ts"
import { ROUNDS, makeRate, percentile, playRandomRounds } from "./random-play.ts"

type Bucket = { count: number; points: number; made: number }

function emptyBucket(): Bucket {
  return { count: 0, points: 0, made: 0 }
}

function add(bucket: Bucket, points: number, floor: number) {
  bucket.count += 1
  bucket.points += points
  if (points >= floor) bucket.made += 1
}

function printBucket(label: string, bucket: Bucket) {
  if (bucket.count === 0) {
    console.log(`  ${label.padEnd(10)} n=0`)
    return
  }
  const average = bucket.points / bucket.count
  const made = (bucket.made / bucket.count) * 100
  console.log(`  ${label.padEnd(10)} n=${String(bucket.count).padEnd(6)} avg ${average.toFixed(1).padStart(7)}  made ${made.toFixed(1)}%`)
}

console.log(`Hidden Partner floor simulation: ${ROUNDS} rounds, configured floors`)
for (const players of [5, 6, 7, 8, 9] as const) {
  const floor = bidFloor(players)
  const run = playRandomRounds(players)
  const points = run.samples.map((sample) => sample.teamPoints)
  const made = makeRate(points, floor) * 100
  const avgPoints = points.reduce((sum, value) => sum + value, 0) / points.length
  const avgSize = run.samples.reduce((sum, sample) => sum + sample.teamSize, 0) / run.samples.length
  const oneCopy = emptyBucket()
  const twoCopies = emptyBucket()
  const teamTwo = emptyBucket()
  const teamThree = emptyBucket()
  for (const sample of run.samples) {
    add(sample.copiesHeld === 1 ? oneCopy : twoCopies, sample.teamPoints, floor)
    if (sample.teamSize === 2) add(teamTwo, sample.teamPoints, floor)
    if (sample.teamSize === 3) add(teamThree, sample.teamPoints, floor)
  }

  console.log("")
  console.log(
    `${players} players  floor ${floor}  stuck ${run.stuck}  redeals ${run.redeals}  floorMade ${made.toFixed(1)}%  avgTeamPoints ${avgPoints.toFixed(1)}  avgTeamSize ${avgSize.toFixed(2)}`,
  )
  printBucket("1 copy", oneCopy)
  printBucket("2 copies", twoCopies)
  printBucket("team 2", teamTwo)
  printBucket("team 3", teamThree)
  console.log(
    `  percentiles  p10 ${percentile(points, 10)}  p25 ${percentile(points, 25)}  p50 ${percentile(points, 50)}  p75 ${percentile(points, 75)}  p90 ${percentile(points, 90)}`,
  )
  if (run.problem) console.log(`  ${run.problem}`)
  if (run.stuck !== 0) process.exitCode = 1
}
