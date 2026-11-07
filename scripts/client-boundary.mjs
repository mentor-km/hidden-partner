const SERVER_ONLY = [
  "packages/rules/src/deal.ts",
  "packages/rules/src/rng.ts",
  "apps/server/src/play.ts",
  "apps/server/src/lobby.ts",
  "apps/server/src/room.ts",
  "apps/server/src/index.ts",
]

export function serverOnlyModule(id) {
  const normalized = id.replaceAll("\\", "/")
  return SERVER_ONLY.find((suffix) => normalized.endsWith(suffix)) ?? null
}
