const MUTED = "hp.muted"

export function loadMuted(): boolean {
  return localStorage.getItem(MUTED) === "1"
}

export function saveMuted(muted: boolean): void {
  localStorage.setItem(MUTED, muted ? "1" : "0")
}

let context: AudioContext | null = null
let armed = false

export function armAudio(): void {
  if (armed) return
  armed = true
  const Context = window.AudioContext
  if (!Context) return
  context = new Context()
}

export function playSound(kind: "turn" | "card" | "partner" | "round"): void {
  if (!armed || !context || loadMuted()) return
  const now = context.currentTime
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.03, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
  gain.connect(context.destination)
  const tone = context.createOscillator()
  tone.type = "sine"
  const start = kind === "turn" ? 620 : kind === "card" ? 392 : kind === "partner" ? 784 : 294
  tone.frequency.setValueAtTime(start, now)
  if (kind === "round") tone.frequency.exponentialRampToValueAtTime(196, now + 0.26)
  if (kind === "partner") tone.frequency.exponentialRampToValueAtTime(988, now + 0.18)
  tone.connect(gain)
  tone.start(now)
  tone.stop(now + 0.28)
}
