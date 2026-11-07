/** Timers and limits for one room. Tests may override these per lobby. */
export const config = {
  hostHandoverMs: 2 * 60 * 1000,
  lobbyExpiryMs: 24 * 60 * 60 * 1000,
  matchRetentionMs: 30 * 24 * 60 * 60 * 1000,
  pinMaxAttempts: 5,
  pinLockoutMs: 5 * 60 * 1000,
  maxMessageBytes: 4_096,
  claimCodeLength: 6,
}

export type TimingConfig = typeof config
